-- ===== C.0 Guardas de preflight =====
DO $$ BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN RAISE EXCEPTION 'PG >= 15 required'; END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN RAISE EXCEPTION 'has_role missing'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relname LIKE 'sec\_%')
     OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'sec\_%')
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'sec\_%')
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'sec\_%')
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname LIKE 'sec\_%')
     OR EXISTS (SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace AND typname LIKE 'sec\_%')   -- todos los tipos, incluidos los compuestos
  THEN RAISE EXCEPTION 'sec_* objects present: manual compatibility review (F.1) required before Build'; END IF;
END $$;

-- ===== C.1 sec_is_admin =====
CREATE FUNCTION public.sec_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false
              ELSE COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role), false) END
$$;
ALTER FUNCTION public.sec_is_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sec_is_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sec_is_admin() TO anon, authenticated;

-- ===== C.2 Empresas =====
CREATE TABLE public.sec_companies (
  cik           text PRIMARY KEY CHECK (cik ~ '^[0-9]{10}$'),
  entity_name   text NOT NULL,
  is_published  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ===== C.3 Tickers (company_tickers.json se carga FUERA del registro de corridas) =====
CREATE TABLE public.sec_ticker_mappings (
  ticker      text NOT NULL CHECK (ticker ~ '^[A-Z0-9.\-]{1,10}$'),
  cik         text NOT NULL REFERENCES public.sec_companies(cik) ON DELETE RESTRICT,
  exchange    text,
  is_active   boolean NOT NULL DEFAULT true,
  valid_from  date,
  valid_to    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, cik),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX sec_ticker_active_uq ON public.sec_ticker_mappings(ticker) WHERE is_active;

-- ===== C.4 Corridas: una por recurso descargado =====
CREATE TABLE public.sec_ingestion_runs (
  run_id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cik                     text NOT NULL REFERENCES public.sec_companies(cik) ON DELETE RESTRICT,
  resource_kind           text NOT NULL CHECK (resource_kind IN ('submissions','submissions_page','companyfacts')),
  page_name               text CHECK (page_name IS NULL OR page_name ~ '^CIK[0-9]{10}-submissions-[0-9]{3}\.json$'),
  endpoint_url            text NOT NULL,
  status                  text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  started_at              timestamptz NOT NULL DEFAULT now(),
  finished_at             timestamptz,
  user_agent              text NOT NULL,
  initiated_by            uuid,
  -- descarga (solo vía sec_record_download)
  http_status             integer CHECK (http_status BETWEEN 100 AND 599),
  content_type            text,
  payload_bytes           bigint CHECK (payload_bytes >= 0),
  payload_sha256          bytea CHECK (payload_sha256 IS NULL OR octet_length(payload_sha256) = 32),
  storage_bucket          text,     -- siempre NULL en M1.1 (B11)
  storage_path            text,     -- siempre NULL en M1.1 (B11)
  -- contadores de submissions / submissions_page (solo vía sec_finalize_run)
  -- [C] = aportado por el cliente (backend), no verificable en la BD; [DB] = recontado o derivado en la BD
  payload_filing_count    integer CHECK (payload_filing_count >= 0),     -- [C] filings ELEGIBLES (4 formularios) del payload
  filings_skipped_form    integer CHECK (filings_skipped_form >= 0),     -- [C] filas de otros formularios, excluidas por filtro
  filings_inserted        integer CHECK (filings_inserted >= 0),         -- [DB] count(first_run_id = run)
  filings_not_inserted        integer CHECK (filings_not_inserted >= 0),         -- [DB] = payload_filing_count - filings_inserted; incluye preexistentes idénticos Y repeticiones idénticas dentro del mismo payload (no significa "preexistente")
  filing_conflicts        integer CHECK (filing_conflicts >= 0),         -- [C] debe coincidir con las muestras (≤100)
  -- contadores de companyfacts (solo vía sec_finalize_run)
  payload_fact_count      integer CHECK (payload_fact_count >= 0),       -- [C] objetos elegibles (us-gaap/dei y formulario elegible)
  facts_skipped_scope     integer CHECK (facts_skipped_scope >= 0),      -- [C] fuera de alcance (otra taxonomía u otro formulario)
  payload_duplicate_count integer CHECK (payload_duplicate_count >= 0),  -- [C] contenido canónico repetido dentro del payload
  facts_inserted          integer CHECK (facts_inserted >= 0),           -- [DB] count(first_run_id = run)
  facts_existing          integer CHECK (facts_existing >= 0),           -- [DB] count(distinct raw_fact_hash de las observaciones de la corrida) - facts_inserted
  facts_rejected          integer CHECK (facts_rejected >= 0),           -- [C] estructura no reconocida o accn elegible ausente
  observations_written    integer CHECK (observations_written >= 0),     -- [DB]
  metadata_conflicts      integer CHECK (metadata_conflicts >= 0),       -- [DB]
  frame_changes           integer CHECK (frame_changes >= 0),            -- [DB]
  conflict_samples        jsonb CHECK (conflict_samples IS NULL OR
                            (jsonb_typeof(conflict_samples) = 'array' AND jsonb_array_length(conflict_samples) <= 100)),
  error_message           text,
  UNIQUE (cik, run_id),
  UNIQUE (cik, run_id, resource_kind),
  CHECK ((resource_kind = 'submissions_page') = (page_name IS NOT NULL)),
  CHECK (endpoint_url = CASE resource_kind
    WHEN 'submissions'      THEN 'https://data.sec.gov/submissions/CIK' || cik || '.json'
    WHEN 'submissions_page' THEN 'https://data.sec.gov/submissions/' || page_name
    WHEN 'companyfacts'     THEN 'https://data.sec.gov/api/xbrl/companyfacts/CIK' || cik || '.json' END),
  CHECK (page_name IS NULL OR substr(page_name, 4, 10) = cik),
  CHECK (storage_bucket IS NULL AND storage_path IS NULL),           -- se relaja en M1.3
  CHECK ((status = 'running') = (finished_at IS NULL)),
  CHECK (status <> 'failed' OR error_message IS NOT NULL),
  CHECK (status <> 'completed' OR (http_status = 200 AND payload_sha256 IS NOT NULL AND payload_bytes IS NOT NULL)),
  -- Cada contador requerido se exige NOT NULL de forma explícita: un CHECK que evalúa NULL se considera superado
  CHECK (status <> 'completed' OR resource_kind = 'companyfacts' OR (
           payload_filing_count IS NOT NULL AND filings_skipped_form IS NOT NULL
           AND filings_inserted IS NOT NULL AND filings_not_inserted IS NOT NULL AND filing_conflicts IS NOT NULL
           AND filing_conflicts = 0
           AND filings_inserted + filings_not_inserted = payload_filing_count
           AND payload_fact_count IS NULL AND observations_written IS NULL)),
  CHECK (status <> 'completed' OR resource_kind <> 'companyfacts' OR (
           payload_fact_count IS NOT NULL AND facts_skipped_scope IS NOT NULL AND payload_duplicate_count IS NOT NULL
           AND facts_inserted IS NOT NULL AND facts_existing IS NOT NULL AND facts_rejected IS NOT NULL
           AND observations_written IS NOT NULL AND metadata_conflicts IS NOT NULL AND frame_changes IS NOT NULL
           AND facts_rejected = 0 AND metadata_conflicts = 0
           AND observations_written + payload_duplicate_count = payload_fact_count
           AND payload_filing_count IS NULL AND filings_inserted IS NULL))
);

-- ===== C.5 Filings (solo desde corridas submissions / submissions_page) =====
CREATE TABLE public.sec_filings (
  cik               text NOT NULL REFERENCES public.sec_companies(cik) ON DELETE RESTRICT,
  accession_number  text NOT NULL CHECK (accession_number ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
  form              text NOT NULL CHECK (form IN ('10-K','10-K/A','10-Q','10-Q/A')),
  filed_date        date NOT NULL,
  accepted_at       timestamptz,
  report_date       date,
  first_run_id      uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cik, accession_number),
  FOREIGN KEY (cik, first_run_id) REFERENCES public.sec_ingestion_runs(cik, run_id) ON DELETE RESTRICT
);

-- ===== C.6 Raw facts (identidad lógica; append-only) =====
CREATE TABLE public.sec_raw_facts (
  fact_hash          bytea PRIMARY KEY CHECK (octet_length(fact_hash) = 32),
  fact_hash_version  smallint NOT NULL DEFAULT 1 CHECK (fact_hash_version = 1),
  cik                text NOT NULL,
  accession_number   text NOT NULL,
  taxonomy_key       text NOT NULL CHECK (taxonomy_key IN ('us-gaap','dei')),  -- alcance aprobado (B6); clave exacta de companyfacts
  taxonomy_uri       text,            -- solo procedencia; NULL en M1.1; fuera del hash v1
  tag                text NOT NULL,
  unit               text,            -- nullable (texto sin unidad)
  period_type        text NOT NULL CHECK (period_type IN ('instant','duration')),
  period_start       date,
  period_end         date NOT NULL,
  value_kind         text NOT NULL CHECK (value_kind IN ('numeric','text','nil')),
  value_numeric      numeric,
  value_text         text,
  fiscal_year        integer,         -- fy de la primera observación (referencia para detectar conflictos)
  fiscal_period      text,            -- fp de la primera observación; sin reglas de M1.2
  first_run_id       uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cik, fact_hash),
  FOREIGN KEY (cik, accession_number) REFERENCES public.sec_filings(cik, accession_number) ON DELETE RESTRICT,
  FOREIGN KEY (cik, first_run_id) REFERENCES public.sec_ingestion_runs(cik, run_id) ON DELETE RESTRICT,
  CHECK (taxonomy_uri IS NULL),     -- se relaja en M1.3
  CHECK ((period_type = 'instant'  AND period_start IS NULL) OR
         (period_type = 'duration' AND period_start IS NOT NULL AND period_start <= period_end)),
  CHECK ((value_kind = 'numeric' AND value_numeric IS NOT NULL AND value_text IS NULL AND unit IS NOT NULL) OR
         (value_kind = 'text'    AND value_text IS NOT NULL AND value_numeric IS NULL) OR
         (value_kind = 'nil'     AND value_text IS NULL AND value_numeric IS NULL)),
  CHECK (value_numeric IS NULL OR value_numeric NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))
);

-- ===== C.7 Observaciones (append-only; deduplicación solo por contenido canónico idéntico) =====
CREATE TABLE public.sec_raw_fact_observations (
  observation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cik              text NOT NULL,
  raw_fact_hash    bytea NOT NULL,
  run_id           uuid NOT NULL,
  frame            text,
  form             text,
  filed_date       date,
  fiscal_year      integer,
  fiscal_period    text,
  raw_json         jsonb NOT NULL,    -- objeto semántico COMPLETO: {taxonomy_key, tag, unit} heredados + campos hoja; NO son los bytes originales
  raw_json_sha256  bytea NOT NULL CHECK (octet_length(raw_json_sha256) = 32),  -- JSON canónico (D.3)
  conflict         boolean NOT NULL DEFAULT false,
  conflict_kind    text CHECK (conflict_kind IN ('metadata','frame_only')),
  conflict_detail  jsonb,
  observed_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sec_obs_content_uq UNIQUE NULLS NOT DISTINCT (run_id, raw_fact_hash, raw_json_sha256),
  FOREIGN KEY (cik, raw_fact_hash) REFERENCES public.sec_raw_facts(cik, fact_hash) ON DELETE RESTRICT,
  FOREIGN KEY (cik, run_id) REFERENCES public.sec_ingestion_runs(cik, run_id) ON DELETE RESTRICT,
  CHECK (conflict = (conflict_kind IS NOT NULL)),
  CHECK (conflict = (conflict_detail IS NOT NULL))
);
-- Nota: las tres columnas son NOT NULL, así que NULLS NOT DISTINCT no altera el comportamiento;
-- se declara para que la semántica no cambie si en el futuro alguna pasa a ser nullable.

-- ===== C.8 Normalized facts (versionados) =====
CREATE TABLE public.sec_normalized_facts (
  normalized_fact_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cik                     text NOT NULL REFERENCES public.sec_companies(cik) ON DELETE RESTRICT,
  canonical_concept       text NOT NULL CHECK (canonical_concept ~ '^[A-Za-z][A-Za-z0-9_.:-]*$'),   -- ASCII, sin '|'
  unit                    text NOT NULL CHECK (unit !~ '[|]' AND unit IS NFC NORMALIZED AND unit = btrim(unit) AND unit <> ''),
  period_type             text NOT NULL CHECK (period_type IN ('instant','duration')),
  period_start            date,
  period_end              date NOT NULL,
  logical_key             text NOT NULL,   -- lo calcula sec_insert_guard (rama sec_normalized_facts); el valor del cliente se sobrescribe
  accession_number        text NOT NULL,   -- procedencia / versión de filing
  value_numeric           numeric NOT NULL
                          CHECK (value_numeric NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
  sec_fiscal_year         integer,
  sec_fiscal_period       text,
  resolved_fiscal_year    integer,         -- M1.2; NULL en M1.1
  resolved_fiscal_period  text,
  normalizer_version      text NOT NULL,
  rule_version            text NOT NULL,
  source_run_id           uuid NOT NULL,   -- corrida companyfacts 'completed' (trigger)
  is_current              boolean NOT NULL DEFAULT true,
  superseded_by           uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cik, normalized_fact_id),
  UNIQUE (cik, logical_key, accession_number, normalized_fact_id),
  CONSTRAINT sec_norm_version_uq UNIQUE (cik, logical_key, accession_number, normalizer_version, rule_version),
  FOREIGN KEY (cik, accession_number) REFERENCES public.sec_filings(cik, accession_number) ON DELETE RESTRICT,
  FOREIGN KEY (cik, source_run_id) REFERENCES public.sec_ingestion_runs(cik, run_id) ON DELETE RESTRICT,
  FOREIGN KEY (cik, logical_key, accession_number, superseded_by)
    REFERENCES public.sec_normalized_facts(cik, logical_key, accession_number, normalized_fact_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CHECK (superseded_by IS NULL OR superseded_by <> normalized_fact_id),
  CHECK (is_current = (superseded_by IS NULL)),
  CHECK ((period_type = 'instant'  AND period_start IS NULL) OR
         (period_type = 'duration' AND period_start IS NOT NULL AND period_start <= period_end))
);
CREATE UNIQUE INDEX sec_norm_current_uq ON public.sec_normalized_facts(cik, logical_key, accession_number) WHERE is_current;

-- ===== C.9 Linaje normalizado -> raw =====
CREATE TABLE public.sec_normalized_fact_sources (
  cik                 text NOT NULL,
  normalized_fact_id  uuid NOT NULL,
  raw_fact_hash       bytea NOT NULL,
  role                text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','component','fallback')),
  PRIMARY KEY (cik, normalized_fact_id, raw_fact_hash),
  FOREIGN KEY (cik, normalized_fact_id) REFERENCES public.sec_normalized_facts(cik, normalized_fact_id) ON DELETE RESTRICT,
  FOREIGN KEY (cik, raw_fact_hash) REFERENCES public.sec_raw_facts(cik, fact_hash) ON DELETE RESTRICT
);

CREATE INDEX sec_raw_facts_lookup ON public.sec_raw_facts(cik, taxonomy_key, tag, period_end);
CREATE INDEX sec_obs_run          ON public.sec_raw_fact_observations(cik, run_id);
CREATE INDEX sec_obs_fact         ON public.sec_raw_fact_observations(raw_fact_hash);
CREATE INDEX sec_norm_lookup      ON public.sec_normalized_facts(cik, canonical_concept, period_end) WHERE is_current;

-- ===== C.10 Triggers =====
CREATE TRIGGER sec_companies_updated_at BEFORE UPDATE ON public.sec_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mutaciones según la tabla
CREATE FUNCTION public.sec_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION '%: % forbidden', TG_TABLE_NAME, TG_OP USING ERRCODE = '42501'; END IF;
  IF TG_TABLE_NAME = 'sec_ingestion_runs' THEN
    -- Defensa en profundidad: solo las RPC de C.11 (propietario postgres) tienen UPDATE
    IF OLD.status <> 'running' THEN RAISE EXCEPTION 'run already finalised' USING ERRCODE = '42501'; END IF;
    IF (NEW.run_id, NEW.cik, NEW.resource_kind, NEW.page_name, NEW.endpoint_url, NEW.started_at, NEW.user_agent, NEW.initiated_by)
       IS DISTINCT FROM (OLD.run_id, OLD.cik, OLD.resource_kind, OLD.page_name, OLD.endpoint_url, OLD.started_at, OLD.user_agent, OLD.initiated_by) THEN
      RAISE EXCEPTION 'run identity immutable' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sec_normalized_facts' THEN
    IF (to_jsonb(NEW) - 'is_current' - 'superseded_by') <> (to_jsonb(OLD) - 'is_current' - 'superseded_by')
       OR NOT (OLD.is_current AND NOT NEW.is_current AND NEW.superseded_by IS NOT NULL) THEN
      RAISE EXCEPTION 'only supersession allowed' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '%: UPDATE forbidden (append-only)', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;

-- Invariantes de INSERT: estado y tipo de corrida
CREATE FUNCTION public.sec_insert_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r record;
BEGIN
  IF TG_TABLE_NAME = 'sec_ingestion_runs' THEN
    -- Estado inicial limpio: todos los campos de descarga, contadores, muestras, error y almacenamiento a NULL
    IF NEW.status <> 'running' OR num_nonnulls(
         NEW.finished_at, NEW.http_status, NEW.content_type, NEW.payload_bytes, NEW.payload_sha256,
         NEW.storage_bucket, NEW.storage_path,
         NEW.payload_filing_count, NEW.filings_skipped_form, NEW.filings_inserted, NEW.filings_not_inserted, NEW.filing_conflicts,
         NEW.payload_fact_count, NEW.facts_skipped_scope, NEW.payload_duplicate_count, NEW.facts_inserted, NEW.facts_existing,
         NEW.facts_rejected, NEW.observations_written, NEW.metadata_conflicts, NEW.frame_changes,
         NEW.conflict_samples, NEW.error_message) > 0 THEN
      RAISE EXCEPTION 'runs must be created empty and running' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'sec_filings' THEN
    SELECT status, resource_kind INTO r FROM public.sec_ingestion_runs WHERE run_id = NEW.first_run_id;
    IF r.status IS DISTINCT FROM 'running' OR r.resource_kind NOT IN ('submissions','submissions_page') THEN
      RAISE EXCEPTION 'filings require a running submissions run' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'sec_raw_facts' THEN
    SELECT status, resource_kind INTO r FROM public.sec_ingestion_runs WHERE run_id = NEW.first_run_id;
    IF r.status IS DISTINCT FROM 'running' OR r.resource_kind <> 'companyfacts' THEN
      RAISE EXCEPTION 'raw facts require a running companyfacts run' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'sec_raw_fact_observations' THEN
    SELECT status, resource_kind INTO r FROM public.sec_ingestion_runs WHERE run_id = NEW.run_id;
    IF r.status IS DISTINCT FROM 'running' OR r.resource_kind <> 'companyfacts' THEN
      RAISE EXCEPTION 'observations require a running companyfacts run' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'sec_normalized_facts' THEN
    SELECT status, resource_kind INTO r FROM public.sec_ingestion_runs WHERE run_id = NEW.source_run_id;
    IF r.status IS DISTINCT FROM 'completed' OR r.resource_kind <> 'companyfacts' THEN
      RAISE EXCEPTION 'normalization requires a completed companyfacts run' USING ERRCODE = '23514'; END IF;
    IF NOT NEW.is_current OR NEW.superseded_by IS NOT NULL THEN
      RAISE EXCEPTION 'new versions are inserted as current' USING ERRCODE = '23514'; END IF;
    -- logical_key estructural determinista (B10)
    NEW.logical_key := NEW.canonical_concept || '|' || NEW.unit || '|' || NEW.period_type || '|'
                       || COALESCE(to_char(NEW.period_start, 'YYYY-MM-DD'), '') || '|'
                       || to_char(NEW.period_end, 'YYYY-MM-DD');
  ELSIF TG_TABLE_NAME = 'sec_normalized_fact_sources' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.sec_normalized_facts n
      JOIN public.sec_raw_fact_observations o
        ON o.cik = n.cik AND o.run_id = n.source_run_id AND o.raw_fact_hash = NEW.raw_fact_hash
      WHERE n.cik = NEW.cik AND n.normalized_fact_id = NEW.normalized_fact_id) THEN
      RAISE EXCEPTION 'lineage must come from the source run' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- Al COMMIT: cada normalized fact necesita al menos una fuente válida
CREATE FUNCTION public.sec_norm_lineage_check() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sec_normalized_fact_sources s
                 WHERE s.cik = NEW.cik AND s.normalized_fact_id = NEW.normalized_fact_id) THEN
    RAISE EXCEPTION 'normalized fact % has no lineage', NEW.normalized_fact_id USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT 1 FROM public.sec_normalized_fact_sources s
             WHERE s.cik = NEW.cik AND s.normalized_fact_id = NEW.normalized_fact_id
               AND NOT EXISTS (SELECT 1 FROM public.sec_raw_fact_observations o
                               WHERE o.cik = s.cik AND o.run_id = NEW.source_run_id
                                 AND o.raw_fact_hash = s.raw_fact_hash)) THEN
    RAISE EXCEPTION 'lineage not observed in source run' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;

-- Al COMMIT: la supersession apunta a una versión DISTINTA que queda VIGENTE para el mismo (cik, logical_key, accession).
-- No se usa created_at: now() es estable dentro de una transacción y no define una secuencia.
-- La cadena es acíclica porque solo se retira una fila vigente, el destino debe seguir vigente al COMMIT
-- y sec_norm_current_uq admite una sola vigente por identidad.
CREATE FUNCTION public.sec_supersession_check() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE t public.sec_normalized_facts%ROWTYPE;
BEGIN
  IF NEW.superseded_by IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO t FROM public.sec_normalized_facts WHERE normalized_fact_id = NEW.superseded_by;
  IF NOT t.is_current
     OR (t.normalizer_version, t.rule_version) = (NEW.normalizer_version, NEW.rule_version) THEN
    RAISE EXCEPTION 'supersession must target a distinct, current version' USING ERRCODE = '23514'; END IF;
  RETURN NULL;   -- misma empresa, logical_key y accession: lo garantiza la FK compuesta
END $$;

CREATE TRIGGER sec_runs_guard    BEFORE UPDATE OR DELETE ON public.sec_ingestion_runs          FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_filings_guard BEFORE UPDATE OR DELETE ON public.sec_filings                 FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_raw_guard     BEFORE UPDATE OR DELETE ON public.sec_raw_facts               FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_obs_guard     BEFORE UPDATE OR DELETE ON public.sec_raw_fact_observations   FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_norm_guard    BEFORE UPDATE OR DELETE ON public.sec_normalized_facts        FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_src_guard     BEFORE UPDATE OR DELETE ON public.sec_normalized_fact_sources FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_runs_trunc    BEFORE TRUNCATE ON public.sec_ingestion_runs          FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_filings_trunc BEFORE TRUNCATE ON public.sec_filings                 FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_raw_trunc     BEFORE TRUNCATE ON public.sec_raw_facts               FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_obs_trunc     BEFORE TRUNCATE ON public.sec_raw_fact_observations   FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_norm_trunc    BEFORE TRUNCATE ON public.sec_normalized_facts        FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_src_trunc     BEFORE TRUNCATE ON public.sec_normalized_fact_sources FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_runs_ins      BEFORE INSERT ON public.sec_ingestion_runs          FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE TRIGGER sec_filings_ins   BEFORE INSERT ON public.sec_filings                 FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE TRIGGER sec_raw_ins       BEFORE INSERT ON public.sec_raw_facts               FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE TRIGGER sec_obs_ins       BEFORE INSERT ON public.sec_raw_fact_observations   FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE TRIGGER sec_norm_ins      BEFORE INSERT ON public.sec_normalized_facts        FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE TRIGGER sec_src_ins       BEFORE INSERT ON public.sec_normalized_fact_sources FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE CONSTRAINT TRIGGER sec_norm_lineage AFTER INSERT ON public.sec_normalized_facts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.sec_norm_lineage_check();
CREATE CONSTRAINT TRIGGER sec_norm_supersession AFTER UPDATE ON public.sec_normalized_facts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.sec_supersession_check();

-- ===== C.11 RPC de ciclo de vida de corrida (única ruta para modificar una corrida) =====
CREATE FUNCTION public.sec_record_download(_run_id uuid, _http_status integer, _content_type text,
                                           _payload_bytes bigint, _payload_sha256 bytea)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.sec_ingestion_runs
     SET http_status = _http_status, content_type = _content_type,
         payload_bytes = _payload_bytes, payload_sha256 = _payload_sha256
   WHERE run_id = _run_id AND status = 'running' AND http_status IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'download already recorded or run not running'; END IF;
END $$;

CREATE FUNCTION public.sec_fail_run(_run_id uuid, _message text, _conflict_samples jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.sec_ingestion_runs
     SET status = 'failed', finished_at = now(),
         error_message = COALESCE(NULLIF(_message, ''), 'unspecified failure'),
         conflict_samples = COALESCE(_conflict_samples, conflict_samples)
   WHERE run_id = _run_id AND status = 'running';
  IF NOT FOUND THEN RAISE EXCEPTION 'run not running'; END IF;
END $$;

-- Recuperación de corridas huérfanas (se perdió la conexión antes de finalizar)
CREATE FUNCTION public.sec_fail_stale_runs(_older_than interval) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  IF _older_than IS NULL OR _older_than < interval '15 minutes' THEN
    RAISE EXCEPTION 'threshold must be non-null and >= 15 minutes'; END IF;
  UPDATE public.sec_ingestion_runs
     SET status = 'failed', finished_at = now(), error_message = 'orphaned: no finalisation before ' || _older_than
   WHERE status = 'running' AND started_at < now() - _older_than;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;

-- Finalización con ramas por resource_kind. Recuenta en la BD lo que es contable por corrida ([DB]);
-- los valores del cliente ([C]) se validan en presencia, signo y coherencia, pero NO se verifican contra el payload
-- (no es recuperable hasta M1.3). Un cast inválido de _counts lanza un error y la corrida sigue en running
-- hasta sec_fail_run o sec_fail_stale_runs.
CREATE FUNCTION public.sec_finalize_run(_run_id uuid, _counts jsonb, _conflict_samples jsonb DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sec_ingestion_runs%ROWTYPE; ok boolean; why text;
        c_payload integer; c_skip integer; c_conf integer; c_dup integer; c_rej integer;
        n_fil_ins integer; n_obs integer; n_distinct integer; n_meta integer; n_frame integer; n_raw_ins integer;
BEGIN
  SELECT * INTO r FROM public.sec_ingestion_runs WHERE run_id = _run_id FOR UPDATE;
  IF r.status IS DISTINCT FROM 'running' THEN RAISE EXCEPTION 'run not running'; END IF;
  IF r.http_status IS DISTINCT FROM 200 OR r.payload_sha256 IS NULL THEN
    PERFORM public.sec_fail_run(_run_id, 'finalize without successful download'); RETURN 'failed'; END IF;

  -- Validación de los valores aportados por el cliente: presentes, enteros y >= 0; si no, la corrida falla
  IF r.resource_kind IN ('submissions','submissions_page') THEN
    c_payload := (_counts->>'payload_filing_count')::int;
    c_skip    := (_counts->>'filings_skipped_form')::int;
    c_conf    := (_counts->>'filing_conflicts')::int;
    IF c_payload IS NULL OR c_skip IS NULL OR c_conf IS NULL OR LEAST(c_payload, c_skip, c_conf) < 0
       OR COALESCE(jsonb_array_length(_conflict_samples), 0) <> LEAST(c_conf, 100) THEN
      PERFORM public.sec_fail_run(_run_id, 'finalize: invalid or missing client counters'); RETURN 'failed'; END IF;
    SELECT count(*) INTO n_fil_ins FROM public.sec_filings WHERE cik = r.cik AND first_run_id = _run_id;
    -- existing derivado en la BD: solo es coherente si no es negativo y no hay conflictos
    ok := c_conf = 0 AND c_payload - n_fil_ins >= 0;
    why := format('filings: eligible(client)=%s inserted(db)=%s conflicts(client)=%s', c_payload, n_fil_ins, c_conf);
    UPDATE public.sec_ingestion_runs SET
      payload_filing_count = c_payload, filings_skipped_form = c_skip, filings_inserted = n_fil_ins,
      filings_not_inserted = GREATEST(c_payload - n_fil_ins, 0), filing_conflicts = c_conf,
      conflict_samples = _conflict_samples
    WHERE run_id = _run_id;
  ELSE
    c_payload := (_counts->>'payload_fact_count')::int;
    c_skip    := (_counts->>'facts_skipped_scope')::int;
    c_dup     := (_counts->>'payload_duplicate_count')::int;
    c_rej     := (_counts->>'facts_rejected')::int;
    IF c_payload IS NULL OR c_skip IS NULL OR c_dup IS NULL OR c_rej IS NULL
       OR LEAST(c_payload, c_skip, c_dup, c_rej) < 0 OR c_dup > c_payload THEN
      PERFORM public.sec_fail_run(_run_id, 'finalize: invalid or missing client counters'); RETURN 'failed'; END IF;
    SELECT count(*), count(DISTINCT raw_fact_hash),
           count(*) FILTER (WHERE conflict_kind = 'metadata'), count(*) FILTER (WHERE conflict_kind = 'frame_only')
      INTO n_obs, n_distinct, n_meta, n_frame
      FROM public.sec_raw_fact_observations WHERE cik = r.cik AND run_id = _run_id;
    SELECT count(*) INTO n_raw_ins FROM public.sec_raw_facts WHERE cik = r.cik AND first_run_id = _run_id;
    ok := n_obs + c_dup = c_payload AND c_rej = 0 AND n_meta = 0 AND n_distinct >= n_raw_ins;
    why := format('facts: eligible(client)=%s dup(client)=%s obs(db)=%s rejected(client)=%s meta(db)=%s raw_ins(db)=%s',
                  c_payload, c_dup, n_obs, c_rej, n_meta, n_raw_ins);
    UPDATE public.sec_ingestion_runs SET
      payload_fact_count = c_payload, facts_skipped_scope = c_skip, payload_duplicate_count = c_dup,
      facts_inserted = n_raw_ins, facts_existing = n_distinct - n_raw_ins, facts_rejected = c_rej,
      observations_written = n_obs, metadata_conflicts = n_meta, frame_changes = n_frame,
      conflict_samples = _conflict_samples
    WHERE run_id = _run_id;
  END IF;

  IF ok THEN
    UPDATE public.sec_ingestion_runs SET status = 'completed', finished_at = now() WHERE run_id = _run_id;
    RETURN 'completed';
  END IF;
  PERFORM public.sec_fail_run(_run_id, 'finalize mismatch: ' || why);
  RETURN 'failed';
END $$;

ALTER FUNCTION public.sec_record_download(uuid,integer,text,bigint,bytea) OWNER TO postgres;
ALTER FUNCTION public.sec_fail_run(uuid,text,jsonb)                       OWNER TO postgres;
ALTER FUNCTION public.sec_fail_stale_runs(interval)                       OWNER TO postgres;
ALTER FUNCTION public.sec_finalize_run(uuid,jsonb,jsonb)                  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sec_record_download(uuid,integer,text,bigint,bytea), public.sec_fail_run(uuid,text,jsonb),
  public.sec_fail_stale_runs(interval), public.sec_finalize_run(uuid,jsonb,jsonb),
  public.sec_guard(), public.sec_insert_guard(), public.sec_norm_lineage_check(), public.sec_supersession_check()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sec_record_download(uuid,integer,text,bigint,bytea), public.sec_fail_run(uuid,text,jsonb),
  public.sec_fail_stale_runs(interval), public.sec_finalize_run(uuid,jsonb,jsonb) TO service_role;

-- ===== C.11b Propiedad explícita: no se depende del rol que ejecute la migración =====
-- Las RPC SECURITY DEFINER (propietario postgres) escriben en estas tablas; postgres debe ser su propietario.
ALTER TABLE public.sec_companies               OWNER TO postgres;
ALTER TABLE public.sec_ticker_mappings         OWNER TO postgres;
ALTER TABLE public.sec_ingestion_runs          OWNER TO postgres;
ALTER TABLE public.sec_filings                 OWNER TO postgres;
ALTER TABLE public.sec_raw_facts               OWNER TO postgres;
ALTER TABLE public.sec_raw_fact_observations   OWNER TO postgres;
ALTER TABLE public.sec_normalized_facts        OWNER TO postgres;
ALTER TABLE public.sec_normalized_fact_sources OWNER TO postgres;
ALTER FUNCTION public.sec_guard()              OWNER TO postgres;
ALTER FUNCTION public.sec_insert_guard()       OWNER TO postgres;
ALTER FUNCTION public.sec_norm_lineage_check() OWNER TO postgres;
ALTER FUNCTION public.sec_supersession_check() OWNER TO postgres;
-- Si el rol migrador no puede transferir la propiedad a postgres (requiere ser postgres, superusuario
-- o miembro de postgres), la migración debe abortar: el preflight F.1 lo comprueba antes.

-- ===== C.12 GRANT (capa 1). Primero REVOKE por los default privileges =====
REVOKE ALL ON public.sec_companies, public.sec_ticker_mappings, public.sec_ingestion_runs, public.sec_filings,
  public.sec_raw_facts, public.sec_raw_fact_observations, public.sec_normalized_facts, public.sec_normalized_fact_sources
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.sec_companies, public.sec_ticker_mappings, public.sec_filings, public.sec_normalized_facts
  TO anon, authenticated;
GRANT SELECT ON public.sec_ingestion_runs, public.sec_raw_facts, public.sec_raw_fact_observations,
  public.sec_normalized_fact_sources TO authenticated;                         -- RLS lo limita a admin
GRANT SELECT, INSERT, UPDATE ON public.sec_companies, public.sec_ticker_mappings TO service_role;
GRANT SELECT, INSERT ON public.sec_ingestion_runs TO service_role;            -- SIN UPDATE: solo RPC (C.11)
GRANT SELECT, INSERT ON public.sec_filings, public.sec_raw_facts, public.sec_raw_fact_observations,
  public.sec_normalized_fact_sources TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.sec_normalized_facts TO service_role;   -- UPDATE limitado a supersession por sec_guard
-- Nadie recibe DELETE ni TRUNCATE. No hay secuencias.

-- ===== C.13 RLS (capa 2) =====
ALTER TABLE public.sec_companies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_ticker_mappings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_ingestion_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_filings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_raw_facts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_raw_fact_observations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_normalized_facts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_normalized_fact_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY sec_companies_read ON public.sec_companies FOR SELECT TO anon, authenticated
  USING (is_published OR public.sec_is_admin());
CREATE POLICY sec_tickers_read ON public.sec_ticker_mappings FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.sec_companies c WHERE c.cik = sec_ticker_mappings.cik AND c.is_published) OR public.sec_is_admin());
CREATE POLICY sec_filings_read ON public.sec_filings FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.sec_companies c WHERE c.cik = sec_filings.cik AND c.is_published) OR public.sec_is_admin());
CREATE POLICY sec_norm_read ON public.sec_normalized_facts FOR SELECT TO anon, authenticated
  USING ((is_current AND EXISTS (SELECT 1 FROM public.sec_companies c WHERE c.cik = sec_normalized_facts.cik AND c.is_published))
         OR public.sec_is_admin());
CREATE POLICY sec_runs_admin    ON public.sec_ingestion_runs          FOR SELECT TO authenticated USING (public.sec_is_admin());
CREATE POLICY sec_raw_admin     ON public.sec_raw_facts               FOR SELECT TO authenticated USING (public.sec_is_admin());
CREATE POLICY sec_obs_admin     ON public.sec_raw_fact_observations   FOR SELECT TO authenticated USING (public.sec_is_admin());
CREATE POLICY sec_sources_admin ON public.sec_normalized_fact_sources FOR SELECT TO authenticated USING (public.sec_is_admin());
-- Sin políticas de escritura ni FOR ALL. service_role (BYPASSRLS) queda limitado por C.12, C.10 y C.11.