# FND-001 / M1.1 — Especificación canónica consolidada (Plan/Review, NO BUILD)

Estado: FND-001 **NOT STARTED**. M1.1 **NOT APPROVED**. Este documento sustituye íntegramente a la versión anterior. No se ha modificado ningún archivo de aplicación ni de migración, no se ha ejecutado DDL/DML y ningún test ha escrito en la base de datos. Las únicas ejecuciones han sido lecturas del catálogo y dos scripts de hash en memoria.

---

## A. Estado de verificación

### A.1 CONFIRMADO
| Punto | Resultado | Fuente |
|---|---|---|
| Servidor | PostgreSQL **17.6**: admite `UNIQUE NULLS NOT DISTINCT` | usuario + psql |
| Tablas `sec_*` y funciones `sec_*` | no existen | usuario + psql |
| `public.has_role(uuid, app_role)` | `boolean`, `STABLE`, `SECURITY DEFINER`, `search_path=public`, propietario `postgres` | psql |
| EXECUTE sobre `has_role` | anon=false, authenticated=true, postgres=true. **No se modifica** | usuario + psql |
| `postgres` sobre `auth` | `has_function_privilege('postgres','auth.uid()','EXECUTE')=true`; `has_schema_privilege('postgres','auth','USAGE')=true` | consulta read-only del usuario |
| `app_role` | `admin,user` | psql |
| Default privileges | `postgres`/`supabase_admin` conceden `arwdDxtm` (tablas), `rwU` (secuencias) y `X` (funciones) a anon/authenticated/service_role. **Es obligatorio un REVOKE explícito en cada objeto nuevo** | psql `pg_default_acl` |
| Fact hash v1 | 18 vectores; Python y TypeScript independientes producen salidas idénticas (D.5) | ejecución en memoria, este turno |
| Defecto de precisión anterior | `Decimal.normalize()` con el contexto por defecto convertía un valor de 61 dígitos en `1.234567890123456789012345679E+39`. El nuevo algoritmo no usa operaciones dependientes del contexto | ejecución, este turno |

### A.2 NOT VERIFIED
- Prueba real con JWT de `sec_is_admin()` (T20).
- Que `companyfacts` contenga hechos de texto o nil: el diseño los admite, pero no se han observado.
- Que las URL de paginación de submissions (`CIK##########-submissions-###.json`) sigan exactamente el patrón del CHECK en todos los emisores. Se tomó de la estructura documentada `filings.files`, sin comprobarlo sobre payloads reales.

### A.3 Defectos de la versión anterior corregidos aquí
1. `taxonomy_ns` (una URI que companyfacts no entrega) se sustituye por `taxonomy_key`. Desaparece `taxonomy_prefix` y se añade `taxonomy_uri` nullable, solo como procedencia.
2. Canonicalización decimal en Python basada en `as_tuple()`, sin contexto. En TypeScript, el exponente se valida (`Number.isSafeInteger` y un límite).
3. La unicidad de observaciones pasa a ser por contenido canónico, `(run_id, raw_fact_hash, raw_json_sha256)`.
4. Contadores y finalización separados por `resource_kind`.
5. `status`/`finished_at` solo cambian mediante RPC SECURITY DEFINER; service_role pierde el UPDATE sobre las corridas.
6. `sec_insert_guard` comprueba `resource_kind`.
7. Linaje obligatorio, comprobado al COMMIT.
8. `logical_key` queda definido en M1.1 sin accession; la versión incluye accession.
9. Las colisiones de metadata de filings se detectan y hacen fallar la corrida.
10. Las páginas antiguas de submissions se registran como `submissions_page`. Antes ningún recurso registrable cubría los accession antiguos que referencia companyfacts.

---

## B. Decisiones
| ID | Decisión | Motivo |
|---|---|---|
| B1 | 8 tablas. Funciones: `sec_is_admin`, guardas de trigger, RPC de corrida (`sec_record_download`, `sec_finalize_run`, `sec_fail_run`, `sec_fail_stale_runs`) | Alcance mínimo y verificable |
| B2 | Toda la ingesta pasa por la función de backend `sec-ingest` (JWT + `sec_is_admin()`) con service role en servidor | Cero DML desde el navegador |
| B3 | El admin humano solo tiene SELECT | El histórico no se altera por acceso ordinario |
| B4 | `sec_is_admin()` sin argumentos, `search_path=''`, propietario postgres | No permite consultar UUID arbitrarios; anon no ejecuta `has_role` |
| B5 | La identidad del hecho usa `taxonomy_key` tal como lo entrega companyfacts (`us-gaap`, `dei`, `srt`, `ifrs-full`, ...) | Es el único identificador de taxonomía presente en la respuesta; no se inventan URI ni versiones |
| B6 | M1.1 cubre solo las taxonomías que entrega companyfacts. **No se afirma que capture namespaces custom de cada emisor** | companyfacts agrega las taxonomías estándar |
| B7 | Si se obtiene `taxonomy_uri` del instance XBRL (M1.3), se guarda como procedencia; incluirla en el hash exige `fact_hash` v2 | Estabilidad de la identidad v1 |
| B8 | Sin dimensiones en M1.1. Un objeto con claves fuera de la allowlist se rechaza y **nunca se hashea** como si no tuviera dimensiones | companyfacts no expone dimensiones XBRL |
| B9 | Conflictos con dos clases. `metadata`: difiere `fy`, `fp`, `form` o `filed`; se marca `conflict=true` y la corrida falla. `frame_only`: solo difiere `frame`; también `conflict=true` y se conserva, pero no hace fallar la corrida | SEC reasigna `frame` entre descargas; si eso hiciera fallar la corrida, toda reingesta posterior fallaría. Ningún caso se pierde |
| B10 | `logical_key` = concepto canónico, unidad, tipo y fechas de periodo, **sin accession**. Versión = `(cik, logical_key, accession_number, normalizer_version, rule_version)`. `is_current` = cálculo vigente para ese accession con esas reglas, **no** el filing más reciente del periodo | Conserva filings y enmiendas como fuentes separadas para análisis point-in-time futuros |
| B11 | Archivado del payload en M1.3. `completed` significa procesado y validado, no recuperable | No existe bucket y no se inventa |
| B12 | Publicación condicionada a `sec_companies.is_published` | Decisión D2 |

---

## C. DDL canónico único

```sql
-- ===== C.0 Guardas de preflight =====
DO $$ BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN RAISE EXCEPTION 'PG >= 15 required'; END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN RAISE EXCEPTION 'has_role missing'; END IF;
  IF to_regclass('public.sec_companies') IS NOT NULL THEN RAISE EXCEPTION 'sec_* present: run F.1 diff first'; END IF;
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
  payload_filing_count    integer CHECK (payload_filing_count >= 0),
  filings_inserted        integer CHECK (filings_inserted >= 0),
  filings_existing        integer CHECK (filings_existing >= 0),   -- ya existían con metadata idéntica
  filing_conflicts        integer CHECK (filing_conflicts >= 0),
  -- contadores de companyfacts (solo vía sec_finalize_run)
  payload_fact_count      integer CHECK (payload_fact_count >= 0),       -- objetos de hecho parseados
  payload_duplicate_count integer CHECK (payload_duplicate_count >= 0),  -- objetos con contenido canónico repetido dentro del payload
  facts_inserted          integer CHECK (facts_inserted >= 0),
  facts_existing          integer CHECK (facts_existing >= 0),
  facts_rejected          integer CHECK (facts_rejected >= 0),
  observations_written    integer CHECK (observations_written >= 0),
  metadata_conflicts      integer CHECK (metadata_conflicts >= 0),
  frame_changes           integer CHECK (frame_changes >= 0),
  conflict_samples        jsonb,    -- hasta 100 ejemplos de conflictos (filings o hechos)
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
  CHECK (status <> 'completed' OR resource_kind = 'companyfacts' OR (
           payload_filing_count IS NOT NULL AND filing_conflicts = 0
           AND filings_inserted + filings_existing = payload_filing_count)),
  CHECK (status <> 'completed' OR resource_kind <> 'companyfacts' OR (
           payload_fact_count IS NOT NULL AND facts_rejected = 0 AND metadata_conflicts = 0
           AND observations_written + payload_duplicate_count = payload_fact_count))
);

-- ===== C.5 Filings (solo desde corridas submissions / submissions_page) =====
CREATE TABLE public.sec_filings (
  cik               text NOT NULL REFERENCES public.sec_companies(cik) ON DELETE RESTRICT,
  accession_number  text NOT NULL CHECK (accession_number ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
  form              text NOT NULL,
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
  taxonomy_key       text NOT NULL CHECK (taxonomy_key ~ '^[a-z][a-z0-9-]*$'),  -- clave de companyfacts, exacta
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
  raw_json         jsonb NOT NULL,    -- forma semántica; NO son los bytes originales
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
  canonical_concept       text NOT NULL CHECK (canonical_concept !~ '[|]'),
  unit                    text NOT NULL CHECK (unit !~ '[|]'),
  period_type             text NOT NULL CHECK (period_type IN ('instant','duration')),
  period_start            date,
  period_end              date NOT NULL,
  logical_key             text NOT NULL,   -- lo fija el trigger sec_norm_key (C.10); no lo escribe el cliente
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
    IF NEW.status <> 'running' OR NEW.finished_at IS NOT NULL OR NEW.http_status IS NOT NULL
       OR NEW.payload_sha256 IS NOT NULL OR NEW.payload_filing_count IS NOT NULL OR NEW.payload_fact_count IS NOT NULL THEN
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

-- Al COMMIT: la supersession apunta a una versión más nueva y vigente del mismo (cik, logical_key, accession)
CREATE FUNCTION public.sec_supersession_check() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE t public.sec_normalized_facts%ROWTYPE;
BEGIN
  IF NEW.superseded_by IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO t FROM public.sec_normalized_facts WHERE normalized_fact_id = NEW.superseded_by;
  IF NOT t.is_current OR t.created_at < NEW.created_at
     OR (t.normalizer_version, t.rule_version) = (NEW.normalizer_version, NEW.rule_version) THEN
    RAISE EXCEPTION 'supersession must target a newer current version' USING ERRCODE = '23514'; END IF;
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
  IF _older_than < interval '15 minutes' THEN RAISE EXCEPTION 'threshold too small'; END IF;
  UPDATE public.sec_ingestion_runs
     SET status = 'failed', finished_at = now(), error_message = 'orphaned: no finalisation before ' || _older_than
   WHERE status = 'running' AND started_at < now() - _older_than;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;

-- Finalización con ramas por resource_kind; recuenta en la BD todo lo que es contable por corrida
CREATE FUNCTION public.sec_finalize_run(_run_id uuid, _counts jsonb, _conflict_samples jsonb DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.sec_ingestion_runs%ROWTYPE; ok boolean; why text;
        n_fil_ins integer; n_obs integer; n_meta integer; n_frame integer; n_raw_ins integer;
BEGIN
  SELECT * INTO r FROM public.sec_ingestion_runs WHERE run_id = _run_id FOR UPDATE;
  IF r.status IS DISTINCT FROM 'running' THEN RAISE EXCEPTION 'run not running'; END IF;
  IF r.http_status IS DISTINCT FROM 200 OR r.payload_sha256 IS NULL THEN
    PERFORM public.sec_fail_run(_run_id, 'finalize without successful download'); RETURN 'failed'; END IF;

  IF r.resource_kind IN ('submissions','submissions_page') THEN
    SELECT count(*) INTO n_fil_ins FROM public.sec_filings WHERE cik = r.cik AND first_run_id = _run_id;
    ok := (_counts->>'filings_inserted')::int = n_fil_ins
          AND n_fil_ins + (_counts->>'filings_existing')::int = (_counts->>'payload_filing_count')::int
          AND (_counts->>'filing_conflicts')::int = 0;
    why := format('filings: payload=%s inserted(db)=%s existing=%s conflicts=%s',
                  _counts->>'payload_filing_count', n_fil_ins, _counts->>'filings_existing', _counts->>'filing_conflicts');
    UPDATE public.sec_ingestion_runs SET
      payload_filing_count = (_counts->>'payload_filing_count')::int, filings_inserted = n_fil_ins,
      filings_existing = (_counts->>'filings_existing')::int, filing_conflicts = (_counts->>'filing_conflicts')::int,
      conflict_samples = _conflict_samples
    WHERE run_id = _run_id;
  ELSE
    SELECT count(*), count(*) FILTER (WHERE conflict_kind = 'metadata'), count(*) FILTER (WHERE conflict_kind = 'frame_only')
      INTO n_obs, n_meta, n_frame
      FROM public.sec_raw_fact_observations WHERE cik = r.cik AND run_id = _run_id;
    SELECT count(*) INTO n_raw_ins FROM public.sec_raw_facts WHERE cik = r.cik AND first_run_id = _run_id;
    ok := n_obs + (_counts->>'payload_duplicate_count')::int = (_counts->>'payload_fact_count')::int
          AND (_counts->>'facts_rejected')::int = 0 AND n_meta = 0
          AND (_counts->>'facts_inserted')::int = n_raw_ins;
    why := format('facts: payload=%s dup=%s obs(db)=%s rejected=%s meta_conflicts(db)=%s raw_inserted(db)=%s',
                  _counts->>'payload_fact_count', _counts->>'payload_duplicate_count', n_obs,
                  _counts->>'facts_rejected', n_meta, n_raw_ins);
    UPDATE public.sec_ingestion_runs SET
      payload_fact_count = (_counts->>'payload_fact_count')::int,
      payload_duplicate_count = (_counts->>'payload_duplicate_count')::int,
      facts_inserted = n_raw_ins, facts_existing = (_counts->>'facts_existing')::int,
      facts_rejected = (_counts->>'facts_rejected')::int, observations_written = n_obs,
      metadata_conflicts = n_meta, frame_changes = n_frame, conflict_samples = _conflict_samples
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
```

### C.14 Alcance de fuentes
- **Registrados en `sec_ingestion_runs`:** `submissions` (`CIK##########.json`), `submissions_page` (ficheros listados en `filings.files`) y `companyfacts`. Ningún otro recurso SEC queda auditado.
- **Fuera del registro:** `company_tickers.json`, que alimenta `sec_ticker_mappings`.
- companyfacts **no expone dimensiones XBRL** ni namespaces custom. M1.1 almacena solo lo que entrega, con `taxonomy_key` tal cual.
- Un hecho de companyfacts cuyo `accn` no exista en `sec_filings` se rechaza (`facts_rejected`). Antes de companyfacts hay que ingerir `submissions` y todas sus páginas.

### C.15 Contrato de ingesta (función de backend `sec-ingest`; solo contrato)
1. Se verifica el JWT y `sec_is_admin()` con el token del llamante. Si falla, 403 y no se crea corrida.
2. `INSERT` de la corrida, que se crea vacía y en `running` (trigger). Es un commit propio.
3. Descarga. `payload_sha256` = SHA-256 de los **bytes exactos del cuerpo HTTP**, antes de parsear. Se registra con `sec_record_download`. Si el estado no es 200, `sec_fail_run`.
4. Parseo con un parser JSON **sin pérdida** para los números (conserva el lexema).
5. **submissions / submissions_page**, en lotes idempotentes:
   - Por cada filing: `INSERT ... ON CONFLICT (cik, accession_number) DO NOTHING RETURNING`.
   - Si no se insertó, se lee el existente y se comparan `form`, `filed_date`, `accepted_at` y `report_date`. Si coinciden, `filings_existing++`. Si difieren, `filing_conflicts++` y se guarda una muestra en `conflict_samples`.
   - Nunca se ignora una diferencia en silencio: la finalización falla con cualquier conflicto.
   - `filings_inserted` lo recuenta la BD (`first_run_id = run`). `filings_existing` lo reporta el backend: en la BD no hay registro por corrida de los filings ya existentes, y esta limitación queda declarada.
6. **companyfacts**, en lotes idempotentes:
   - Validación por allowlist de claves: `start, end, val, accn, fy, fp, form, filed, frame`. Cualquier otra clave o estructura no reconocida implica `facts_rejected++`, sin hash ni inserción.
   - Se calculan `fact_hash` (D.1) y `raw_json_sha256` (D.3).
   - Raw fact: `INSERT ... ON CONFLICT (fact_hash) DO NOTHING RETURNING`. Si ya existía, `facts_existing++` y se compara con la fila existente y su observación de referencia.
   - Si difiere `fy`, `fp`, `form` o `filed`, la observación lleva `conflict=true, conflict_kind='metadata'`. Si solo difiere `frame`, `conflict=true, conflict_kind='frame_only'`. Si hay diferencias, se guardan en `conflict_detail`.
   - Observación: `INSERT ... ON CONFLICT ON CONSTRAINT sec_obs_content_uq DO NOTHING`. Solo deduplica **contenido canónico idéntico** dentro de la misma corrida; un JSON distinto para el mismo `fact_hash` siempre genera otra fila.
   - Los objetos repetidos con contenido idéntico dentro del payload cuentan en `payload_duplicate_count`.
7. **Fallo a mitad:** el backend captura la excepción y llama a `sec_fail_run`. Los lotes ya confirmados permanecen vinculados a la corrida fallida, y el trigger impide añadir más filas.
8. **Corrida huérfana:** si la conexión cae, la corrida queda en `running`. `sec_fail_stale_runs('1 hour')` la marca `failed` como `orphaned` (se ejecuta antes de cada ingesta y bajo demanda).
9. **Cierre:** `sec_finalize_run(run_id, counts)` es la única ruta hacia `completed`.
10. **Reintento:** siempre con una corrida nueva. No se duplican raw facts ni filings; la nueva corrida escribe sus observaciones.
11. **Normalización (M1.2):** solo desde corridas companyfacts `completed`, y cada hecho normalizado necesita al menos una fuente observada en esa corrida.
12. **Significado de `completed`:** descargado, hasheado, procesado y validado. **No** archivado: el payload no es recuperable hasta M1.3.

---

## D. Fact hash v1 y JSON canónico

### D.1 fact_hash v1
```text
fact_hash = SHA-256( DOMAIN || S(cik) || S(accn) || S(taxonomy_key) || S(tag) || S(unit)
                     || S(period_type) || Dt(period_start) || Dt(period_end) || K(value_kind) || V(value) )
DOMAIN = ASCII "navaroli.sec.fact_hash.v1" || 0x00
TLV    = type:uint8 || len:uint32 BE || bytes
types  0x00 NULL(len 0) | 0x01 string | 0x02 date | 0x03 decimal | 0x04 enum
S(x)   NULL -> 0x00 ; else 0x01 + UTF-8(NFC(x))
Dt(x)  NULL -> 0x00 ; else 0x02 + "YYYY-MM-DD"
K      0x04 + "N"|"T"|"X"
V      N -> 0x03 + canon_decimal(lexeme) ; T -> S(text) ; X -> 0x00
```
- `taxonomy_key`: la clave exacta de companyfacts (`us-gaap`, `dei`, ...). `taxonomy_uri` no forma parte del hash v1.
- Excluidos: `frame`, `fy`, `fp`, `form`, `filed`, `taxonomy_uri`.

### D.2 Canonicalización decimal (sin contexto ni float)
1. Lexema: `^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,6})?$`. Se rechazan `NaN`, `Infinity` y cualquier otra cosa.
2. Coeficiente = todos los dígitos como cadena; exponente = exponente del lexema − número de dígitos fraccionarios. Si el exponente no es un entero seguro, o si |exp| > 1000 + longitud del coeficiente, se rechaza.
3. Se quitan los ceros a la izquierda. Si no queda nada, el valor es `0` y se descarta el signo (`-0` → `0`).
4. Se quitan los ceros finales, incrementando el exponente.
5. Se expande sin exponente: entero si exp ≥ 0; si no, se inserta el punto, con `0.` y ceros si hace falta. Se antepone `-` si es negativo.
- Python: `Decimal(str)` (construcción exacta, sin contexto) + `as_tuple()` + manipulación de cadenas. **No** se usa `normalize()`.
- TypeScript: regex + manipulación de cadenas; el exponente se convierte con `Number` solo tras validar `\d{1,6}` y `Number.isSafeInteger`.

### D.3 raw_json_sha256 (JSON canónico semántico)
SHA-256 de una serialización determinista del objeto del hecho tal como se parseó:
- objetos con claves ordenadas por bytes UTF-8 (NFC);
- strings en NFC, con escapes JSON mínimos (`"`, `\`, controles U+0000–U+001F como `\u00XX`);
- números con `canon_decimal` (D.2) y sin comillas;
- arrays en su orden original; `true`/`false`/`null` literales;
- sin espacios, codificado en UTF-8.

Representa el **contenido semántico**. `raw_json` (JSONB) no conserva los bytes, el orden ni el lexema originales, y **no** es una copia exacta. `payload_sha256` cubre los bytes HTTP exactos del recurso.

### D.4 Vectores (calculados en este turno; reemplazan todos los anteriores)
Base: `cik=0000320193`, `accn=0000320193-24-000123`, `taxonomy_key=us-gaap`, `tag=Revenues`, `unit=USD`, duration `2023-10-01..2024-09-28`. `BIG = 1234567890123456789012345678901234567890.123456789012345678901` (61 dígitos significativos).

| ID | Variación | SHA-256 | Relación |
|---|---|---|---|
| V01 | N `1` | `e966b0ede998a9c17ef8546329b88b92a7311836b50ee7db1b6b8dbd21eaff59` | = V02 |
| V02 | N `1.0` | `e966b0ede998a9c17ef8546329b88b92a7311836b50ee7db1b6b8dbd21eaff59` | = V01 |
| V03 | N `-0` | `171241c3cd81b8ede9872ba115e333df1eca4eb446e302f1f4a5e59e919039ba` | = V04 |
| V04 | N `0.000` | `171241c3cd81b8ede9872ba115e333df1eca4eb446e302f1f4a5e59e919039ba` | = V03 |
| V05 | T `NONE` | `f93ce8486032c009ebc70900941771d2cf73c147cfcecd643022ef541e19576e` | ≠ V06 |
| V06 | nil | `154920c36b1d6b56b169d1d937b186da375bcdf7c7d859216240e6a64114221b` | ≠ V05 |
| V07 | T `Café` NFC | `5409c331a541e7f0e98af2f44a1cccd52e2aa423fe61afcead2d58264b5be5f1` | = V08 |
| V08 | T `Cafe\u0301` NFD | `5409c331a541e7f0e98af2f44a1cccd52e2aa423fe61afcead2d58264b5be5f1` | = V07 |
| V09 | N `1.25E3` | `de6eab08c631bdd522ceff0131499c0210f1f53381d6b653d64ce1265eca4394` | = V10 |
| V10 | N `1250.00` | `de6eab08c631bdd522ceff0131499c0210f1f53381d6b653d64ce1265eca4394` | = V09 |
| V11 | instant, start NULL | `a45fe44047d50f777253d9dc8f760bac66c48d36612b66d33fa29998d07b5691` | ≠ V01 |
| V12 | `dei` / `EntityRegistrantName`, T `Apple Inc.`, unit NULL | `8c0f28c23aa132e6e2adbc1ad7a3cdcd55bf9217c78f53f8dcab545483dc9dea` | ≠ V13 |
| V13 | igual que V12 con unit `pure` | `d979095ef406dbe569811371050d7b83ffc212bee990c7e39633e60cc749d6b7` | ≠ V12 |
| V14 | N `-0.0500` | `1ad538688ffdd1923c2b5736c9148493df06742ea2b12e41f62d9c72cf475cc9` | — |
| V15 | N `391035000000` | `0c0bed92c1e609fd2885b6ed0c2a6251fca956cc8b100c5dcd6ab0f8e04fc00d` | — |
| V16 | N `BIG` | `8d694bf30cf356597111e66235ee47d00ec585345d6e09f6d682e65d71890517` | = V17 = V18 |
| V17 | N `BIG` + `000` | `8d694bf30cf356597111e66235ee47d00ec585345d6e09f6d682e65d71890517` | = V16 |
| V18 | N `1234567890123456789012345678901234567890123456789012345678901E-21` | `8d694bf30cf356597111e66235ee47d00ec585345d6e09f6d682e65d71890517` | = V16 |

### D.5 Evidencia (scripts, no tests de base de datos)
- Python 3.13.15 y Bun 1.4.4, ejecutados en memoria con los vectores en la variable de entorno `VJSON`.
- Resultado: **`DIFF: empty (identical, 18 lines)`**.
- Contraprueba del defecto: con el método anterior, `Decimal(BIG).normalize()` daba `1.234567890123456789012345679E+39`, con `as_tuple()` de 61 dígitos. El algoritmo nuevo conserva todos los dígitos.
- Esta evidencia valida que **dos implementaciones del algoritmo coinciden**. No ejecuta ni sustituye ningún test T1–T27.

Python (ejecutado):
```python
import hashlib,unicodedata,json,struct,os
from decimal import Decimal
DOM=b"navaroli.sec.fact_hash.v1\x00"; EXP_LIMIT=1000
def tlv(t,b): return bytes([t])+struct.pack(">I",len(b))+b
def s(x): return tlv(0,b"") if x is None else tlv(1,unicodedata.normalize("NFC",x).encode())
def d(x): return tlv(0,b"") if x is None else tlv(2,x.encode())
def canon_dec(x):
    v=Decimal(x)                      # construcción desde str: exacta, no depende del contexto
    sign,digits,exp=v.as_tuple()
    if not isinstance(exp,int): raise ValueError("NaN/Infinity rejected")
    if abs(exp)>EXP_LIMIT+len(digits): raise ValueError("exponent out of range")
    g="".join(map(str,digits)).lstrip("0")
    if not g: return "0"
    while g.endswith("0"): g=g[:-1]; exp+=1
    if exp>=0: c=g+"0"*exp
    else:
        n=len(g)+exp; c=(g[:n] if n>0 else "0")+"."+("0"*(-n) if n<0 else "")+g[max(n,0):]
    return ("-" if sign else "")+c
def val(f):
    k=f["vkind"]; return tlv(4,k.encode())+(tlv(3,canon_dec(f["val"]).encode()) if k=="N" else s(f["val"]) if k=="T" else tlv(0,b""))
def h(f): return hashlib.sha256(DOM+s(f["cik"])+s(f["accn"])+s(f["tax"])+s(f["tag"])+s(f["unit"])+s(f["ptype"])+d(f["start"])+d(f["end"])+val(f)).hexdigest()
for k,f in json.loads(os.environ["VJSON"]).items(): print(k,h(f))
```
Nota: `Decimal(str)` acepta además `"NaN"`, `"Infinity"` y espacios. La versión de Build validará antes con la regex de D.2, igual que TypeScript.

TypeScript/Bun (ejecutado):
```ts
const {createHash}=require("crypto");
const E=Buffer.alloc(0),DOM=Buffer.from("navaroli.sec.fact_hash.v1\0"),EXP_LIMIT=1000;
const tlv=(t,b)=>{const h=Buffer.alloc(5);h[0]=t;h.writeUInt32BE(b.length,1);return Buffer.concat([h,b]);};
const s=x=>x===null?tlv(0,E):tlv(1,Buffer.from(x.normalize("NFC"),"utf8"));
const d=x=>x===null?tlv(0,E):tlv(2,Buffer.from(x));
function canonDec(x){const m=/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d{1,6}))?$/.exec(x);
 if(!m||!(m[2]||m[3]))throw Error("bad decimal (NaN/Infinity rejected)");
 const frac=m[3]||"";let g=(m[2]||"")+frac;
 const ex=m[4]?Number(m[4]):0; if(!Number.isSafeInteger(ex))throw Error("exponent not safe");
 let e=ex-frac.length; if(Math.abs(e)>EXP_LIMIT+g.length)throw Error("exponent out of range");
 g=g.replace(/^0+/,""); if(!g)return "0";
 while(g.endsWith("0")){g=g.slice(0,-1);e++;}
 let c; if(e>=0)c=g+"0".repeat(e); else{const n=g.length+e;c=(n>0?g.slice(0,n):"0")+"."+(n<0?"0".repeat(-n):"")+g.slice(Math.max(n,0));}
 return (m[1]==="-"?"-":"")+c;}
const val=f=>Buffer.concat([tlv(4,Buffer.from(f.vkind)),f.vkind==="N"?tlv(3,Buffer.from(canonDec(f.val))):f.vkind==="T"?s(f.val):tlv(0,E)]);
for(const [k,f] of Object.entries(JSON.parse(process.env.VJSON)))console.log(k,createHash("sha256").update(Buffer.concat([DOM,s(f.cik),s(f.accn),s(f.tax),s(f.tag),s(f.unit),s(f.ptype),d(f.start),d(f.end),val(f)])).digest("hex"));
```

Comando ejecutado (claves de `VJSON`: `cik, accn, tax, tag, unit, ptype, start, end, vkind, val`):
```bash
P=$(python3 -c "$PY"); T=$(bun -e "$TS")
[ "$P" = "$T" ] && echo "DIFF: empty (identical, $(echo "$P"|wc -l) lines)" || diff <(echo "$P") <(echo "$T")
```
En Build se guardarán en `validation/fnd001/` (`fact_hash.py`, `factHash.ts`, `vectors.json` con los esperados de D.4) y se añadirán vectores de `raw_json_sha256`.

---

## E. Tests (todos NOT RUN)
Aislamiento: cada suite SQL se ejecuta dentro de `BEGIN ... ROLLBACK` en una base de draft o local con la migración aplicada. CIK sintéticos `9999999901` y `9999999902`; sin datos productivos. Los usuarios de prueba (admin y no-admin) los crea y elimina el harness.

| # | Test | Esperado |
|---|---|---|
| T1 | Filing de A con corrida de B | 23503 |
| T2 | Raw fact de A con filing de B; observación de A con corrida de B | 23503 |
| T3 | Normalized de A con filing de B; fuente (A, normalized de A, raw de B) | 23503 |
| T4 | Tipo de valor: numeric+texto, numeric sin unit, text vacío, text+número, nil con valor → 23514; numeric+unit, **text+unit NULL** y nil → OK | según caso |
| T5 | instant con start; duration sin start; start > end | 23514 |
| T6 | `NaN`, `Infinity`, `-Infinity` en `value_numeric` | 23514 |
| T7 | `123456789012345678901234567890123456789.123456789012345678901` se relee idéntico | igualdad |
| T8 | `sec_obs_content_uq`: mismo contenido dos veces en una corrida → 1 fila; mismo `fact_hash` con `raw_json_sha256` distinto → 2 filas | 1 / 2 |
| T9 | Dos corridas distintas con el mismo hecho | 1 raw fact, 2 observaciones |
| T10 | Mismo `fact_hash` con `fiscal_period` distinto → observación `metadata`, `finalize` devuelve `failed`; solo `frame` distinto → `frame_only`, `finalize` devuelve `completed` | según caso |
| T11 | UPDATE/DELETE/TRUNCATE sobre filings, raw facts, observaciones y fuentes, como service_role | 42501 |
| T12 | Normalized: UPDATE del valor → 42501; DELETE → 42501; supersession válida → OK | según caso |
| T13 | Supersession hacia otra empresa | 23503 |
| T14 | Supersession hacia otro `logical_key` u otro accession | 23503 |
| T15 | Supersession hacia una versión más antigua o con la misma versión | 23514 al COMMIT |
| T16 | Corrida: INSERT ya `completed`; endpoint que no corresponde a kind/CIK; `page_name` de otro CIK | 23514 |
| T17 | Fallo a mitad: lote 1 confirmado, excepción en el lote 2 → `sec_fail_run` deja `failed` con observaciones parciales; nuevo INSERT en esa corrida → 23514; reintento con corrida nueva → sin raw facts duplicados y `completed` | según C.15 |
| T18 | Normalizar desde una corrida `failed`, `running` o submissions | 23514 |
| T19 | Hecho con una clave fuera de la allowlist o con `accn` desconocido | rechazado, sin hash, `finalize` devuelve `failed` |
| T20 | `sec_is_admin()`: anon false; no-admin false; admin true; sin UID false | según caso |
| T21 | RLS: anon y no-admin ven solo lo publicado y 0 filas privadas, y su DML → 42501; admin lee todo y su DML → 42501; service_role: INSERT OK, DELETE → 42501 | según caso |
| T22 | `payload_sha256` = `sha256sum` del fixture; `raw_json_sha256` estable aunque cambie el orden de claves o la escala de los números | igualdad |
| T23 | Finalización de submissions: payload de 3 filings (2 nuevos, 1 existente idéntico) → `completed`, `filings_inserted=2` (BD); conteo incoherente → `failed`; `observations_written` no interviene | según caso |
| T24 | Finalización de companyfacts y reingesta: payload de N hechos con 1 duplicado → `completed`; reingesta → `facts_inserted=0`, `facts_existing=N-1`, N-1 observaciones nuevas, `completed` | según caso |
| T25 | Como service_role, `UPDATE sec_ingestion_runs SET status='completed'` → 42501 (sin privilegio); `sec_finalize_run` → OK; `sec_fail_stale_runs` marca huérfanas | según caso |
| T26 | Discordancia de kind: filing con corrida companyfacts; raw fact u observación con corrida submissions | 23514 |
| T27 | (a) Normalized sin fuentes → 23514 al COMMIT. (b) Mismo accession con `form`, `filed_date`, `accepted_at` o `report_date` distintos → `filing_conflicts=1`, muestra guardada, `finalize` devuelve `failed` | según caso |
| TH | Fact hash: `vectors.json` (V01–V18, incluidos los de 61 dígitos) idéntico en Python y TypeScript | diff vacío |

**TH:** como script en memoria, ejecutado (D.5). Como test guardado en el proyecto, NOT RUN. **T1–T27:** NOT RUN.

Comandos previstos (NOT RUN):
```bash
psql -v ON_ERROR_STOP=1 -f validation/fnd001/sql/t01_t27.sql      # BEGIN ... ROLLBACK
bunx vitest run validation/fnd001/access.test.ts                   # T20, T21 con JWT reales
bunx vitest run validation/fnd001/ingest.test.ts validation/fnd001/payload.test.ts   # T10, T17, T19, T22-T25, T27b
python3 validation/fnd001/fact_hash.py > /tmp/py.txt && bun validation/fnd001/factHash.ts > /tmp/ts.txt && diff /tmp/py.txt /tmp/ts.txt   # TH
```

---

## F. Preflight y trazabilidad

### F.1 Preflight de solo lectura
```sql
SELECT current_setting('server_version');                                           -- CONFIRMADO 17.6
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND relname LIKE 'sec\_%';                                 -- CONFIRMADO 0 filas
SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'sec\_%';  -- CONFIRMADO 0 filas
SELECT pg_get_function_result(p.oid), provolatile, prosecdef, proconfig, proowner::regrole
  FROM pg_proc p WHERE p.oid='public.has_role(uuid,public.app_role)'::regprocedure;   -- CONFIRMADO boolean,s,t,{search_path=public},postgres
SELECT r, has_function_privilege(r,'public.has_role(uuid,public.app_role)','EXECUTE')
  FROM unnest(ARRAY['anon','authenticated','postgres']) r;                           -- CONFIRMADO f,t,t
SELECT has_function_privilege('postgres','auth.uid()','EXECUTE');                   -- CONFIRMADO true
SELECT has_schema_privilege('postgres','auth','USAGE');                             -- CONFIRMADO true
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE typname='app_role';   -- CONFIRMADO admin,user
SELECT defaclrole::regrole, defaclobjtype, defaclacl FROM pg_default_acl;           -- CONFIRMADO grants amplios -> REVOKE obligatorio
-- Tras migrar (en el draft): propietarios y ACL de las funciones nuevas
SELECT proname, proowner::regrole, prosecdef, proconfig, proacl FROM pg_proc
 WHERE pronamespace='public'::regnamespace AND proname LIKE 'sec\_%';
--  sec_is_admin: postgres, t, {search_path=""}, X solo para anon/authenticated
--  sec_record_download/sec_fail_run/sec_fail_stale_runs/sec_finalize_run: postgres, t, {search_path=""}, X solo para service_role
SELECT has_table_privilege('service_role','public.sec_ingestion_runs','UPDATE');    -- esperado false
```
Si aparece algún `sec_*`: se comparan `information_schema.columns`, `pg_constraint`, `pg_policies` y `pg_trigger` con la sección C y se informa de las diferencias antes de decidir. No se aborta sin análisis.

### F.2 Matriz requisito → objeto → test
| Requisito | Objeto | Test |
|---|---|---|
| FK multiempresa | C.4–C.9 | T1–T3 |
| Tipos, periodos, NaN, precisión | CHECKs de C.6 y C.8 | T4–T7 |
| Observaciones por contenido | `sec_obs_content_uq`, D.3 | T8, T22 |
| Reingesta sin duplicados | PK `fact_hash`, C.15 | T9, T24 |
| Conflictos de hechos (metadata / frame) | `conflict_kind`, `sec_finalize_run` | T10 |
| Conflictos de filings | C.15.5, `filing_conflicts` | T27b |
| Append-only | `sec_guard`, sin DELETE | T11 |
| Versionado y supersession | `sec_norm_version_uq`, FK compuesta, `sec_supersession_check` | T12–T15 |
| Ciclo de vida de corridas | C.4, `sec_insert_guard`, RPC de C.11, sin UPDATE en C.12 | T16, T25 |
| Atomicidad, fallo y huérfanas | C.15.7–8, `sec_fail_run`, `sec_fail_stale_runs` | T17, T25 |
| Contadores por tipo de recurso | CHECKs de C.4, ramas de `sec_finalize_run` | T23, T24 |
| Tipo de corrida en los inserts | `sec_insert_guard` | T26 |
| Solo se normaliza lo completado | `sec_insert_guard` | T18 |
| Linaje obligatorio | `sec_norm_lineage_check` | T27a |
| Allowlist y accn desconocido | C.15.6, C.14 | T19 |
| Comprobación de admin | `sec_is_admin` | T20 |
| Mínimo privilegio y RLS | C.12, C.13 | T21 |
| Fact hash con `taxonomy_key` y decimal exacto | D.1, D.2 | TH (evidencia D.5) |

---

## G. Riesgos residuales
1. El payload no es recuperable hasta M1.3 (B11).
2. `filings_existing` y `facts_existing` los reporta el backend: la BD no registra por corrida las filas ya existentes. Los insertados y las observaciones sí se recuentan en la BD.
3. Las corridas huérfanas dependen de que se ejecute `sec_fail_stale_runs`. Si no se llama, quedan en `running` (aunque nunca `completed`).
4. Hace falta un parser JSON sin pérdida en el entorno de la función de backend; la dependencia se elige en Build.
5. Los hechos de texto o nil en companyfacts y el patrón real de `submissions_page` no se han observado en payloads reales.
6. `frame_only` conserva la evidencia pero no hace fallar la corrida (B9). Si se prefiere tratarlo como fallo, es una decisión explícita pendiente.
7. T1–T27 no se han ejecutado.

---

## H. Estado final
- **CONFIRMADO:** PostgreSQL 17.6 (admite `NULLS NOT DISTINCT`); no existen tablas ni funciones `sec_*`; definición y propietario de `has_role`; EXECUTE sobre `has_role`: anon=false, authenticated=true, postgres=true (sin cambios); `postgres` puede ejecutar `auth.uid()` y tiene USAGE en `auth`; default privileges amplios (REVOKE obligatorio); fact hash v1 con `taxonomy_key` y decimal exacto: 18 vectores, incluidos los de 61 dígitos, idénticos en Python y TypeScript.
- **NOT VERIFIED:** prueba JWT real de `sec_is_admin()`; hechos de texto o nil y patrón de `submissions_page` en payloads reales.
- **NOT RUN:** T1–T27 y TH como test guardado en el proyecto.
- FND-001 sigue **NOT STARTED**.

M1.1 remains NOT APPROVED; no implementation performed.
