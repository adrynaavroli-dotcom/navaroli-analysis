# FND-001 / M1.1 — Especificación canónica revisada (Plan/Review, NO BUILD)

Estado: FND-001 **NOT STARTED**. M1.1 **NOT APPROVED**. Este documento sustituye íntegramente a la versión anterior. No se ha modificado ningún archivo de aplicación ni de migración. No se ha ejecutado DDL ni DML, y ninguna prueba ha escrito en la base de datos.

---

## A. Auditoría y estado de verificación

### A.1 CONFIRMADO (lecturas de solo lectura)
| Punto | Resultado | Fuente |
|---|---|---|
| Versión del servidor | PostgreSQL **17.6**, que admite `UNIQUE NULLS NOT DISTINCT` (PG ≥ 15) | usuario + psql `server_version` |
| Tablas `sec_*` | **no existen** | usuario + psql `pg_class` |
| `public.sec_is_admin` | **no existe** (0 funciones con ese nombre) | psql `pg_proc` |
| `public.has_role(uuid, app_role)` | devuelve `boolean`, `STABLE`, `SECURITY DEFINER`, `search_path=public`, propietario `postgres` | psql |
| EXECUTE sobre `has_role` | anon=**false**, authenticated=**true**, postgres=**true**. Se preservan sin cambios | usuario + psql (postgres) |
| `app_role` | `admin,user` | psql |
| `update_updated_at_column()` | trigger, `search_path=public` | psql |
| Default privileges | `postgres` y `supabase_admin` conceden por defecto `arwdDxtm` en tablas, `rwU` en secuencias y `X` en funciones a anon/authenticated/service_role. **Hace falta un REVOKE explícito en cada tabla y función nueva** | psql `pg_default_acl` |
| Vectores fact hash v1 | 15 vectores. Python y TypeScript independientes, diff vacío (sección D.4) | ejecución en este turno |

### A.2 NOT VERIFIED
- EXECUTE de `postgres` sobre `auth.uid()`: el rol del sandbox no puede leer el esquema `auth` (`permission denied for schema auth`). Queda como requisito del preflight F.1.
- Que `companyfacts` contenga hechos textuales o nil: el diseño los admite, pero no se ha observado ninguno en un payload real.
- Los 22 tests de base de datos y de integración de la sección E: **NOT RUN**.

### A.3 Defectos de la versión anterior corregidos aquí
1. Las políticas usaban `has_role` directamente, lo que exigía conceder EXECUTE a anon. Ahora usan `public.sec_is_admin()` (C.1).
2. Desaparecen `available_on`, su NOT NULL, su CHECK y la regla de las 17:30 ET. Cualquier semántica point-in-time de mercado requiere una fase aprobada aparte.
3. `sec_raw_facts.unit` pasa a ser nullable. El hash ya codifica NULL (vector V12).
4. `superseded_by` deja de ser una FK simple. Ahora es una FK compuesta `(cik, logical_key, superseded_by)` y un trigger exige que apunte a una versión nueva.
5. La atomicidad tiene un contrato único: lotes idempotentes, y las corridas fallidas conservan sus filas parciales (C.12).
6. `payload_sha256` y `raw_json_sha256` quedan separados. JSONB **no** es una copia exacta del payload.
7. Desaparece la columna `dimensions`. Un hecho con claves dimensionales o desconocidas se rechaza y nunca se hashea.
8. CHECKs completos de tipo y periodo, con rechazo de `NaN` e `±Infinity`.
9. El endpoint queda ligado exactamente a `resource_kind` y al CIK. `company_tickers.json` queda fuera de este registro.
10. Los vectores se calcularon de verdad. Los hashes publicados corresponden al algoritmo v1 sin campo de dimensiones; los hashes provisionales anteriores quedan obsoletos.

---

## B. Decisiones
| ID | Decisión | Motivo |
|---|---|---|
| B1 | Ocho tablas y cuatro funciones de servidor (`sec_is_admin`, `sec_guard`, `sec_insert_guard`, `sec_finalize_run`). Sin vistas | Alcance mínimo |
| B2 | Toda la ingesta pasa por la función de backend `sec-ingest` (JWT + `sec_is_admin()` evaluado con el JWT del llamante) y escribe con service role en el servidor | El navegador nunca escribe; la clave de service role nunca sale del servidor |
| B3 | El admin humano solo tiene SELECT (RLS) | El histórico no se altera por acceso ordinario |
| B4 | `sec_is_admin()` sin argumentos | Impide preguntar por UUID arbitrarios; evita conceder EXECUTE de `has_role` a anon |
| B5 | Identidad del hecho = cik, accn, URI de taxonomía, tag, unit (nullable), tipo de periodo, start, end, tipo de valor y valor. Quedan fuera `frame`, `fy`, `fp`, `form` y `filed` | `frame` lo reasigna SEC; el resto es metadata del documento |
| B6 | `1` y `1.0` comparten hash (valor decimal exacto) | Los números JSON de SEC no tienen escala semántica; `numeric` también los considera iguales |
| B7 | Sin dimensiones en M1.1. Un hecho con claves fuera de la allowlist hace fallar la corrida | No se inventan datos ni se hashea un hecho dimensional como si no tuviera dimensiones |
| B8 | Archivado del payload diferido a M1.3. `completed` = procesado y validado, **no** archivado ni recuperable | No existe ningún bucket y no se inventa ninguno |
| B9 | Normalized facts versionados por `(cik, logical_key, normalizer_version, rule_version)`, con supersession dentro de la misma identidad lógica | Reproducibilidad sin sobrescribir |
| B10 | Solo se normaliza desde corridas `completed` (trigger) | Nunca se normaliza ni se publica una corrida fallida o en curso |
| B11 | Publicación pública condicionada a `sec_companies.is_published` | Decisión D2 |

---

## C. DDL canónico único

```sql
-- ============ C.0 Guardas de preflight (abortan solo ante incompatibilidad real) ============
DO $$ BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'PG >= 15 required for NULLS NOT DISTINCT'; END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'public.has_role(uuid,app_role) missing'; END IF;
  IF to_regclass('public.sec_companies') IS NOT NULL THEN
    RAISE EXCEPTION 'sec_* already present: run F.1 compatibility diff first'; END IF;
END $$;

-- ============ C.1 Comprobación de admin ============
CREATE FUNCTION public.sec_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
           WHEN auth.uid() IS NULL THEN false
           ELSE COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role), false)
         END
$$;
ALTER FUNCTION public.sec_is_admin() OWNER TO postgres;   -- postgres tiene EXECUTE sobre has_role (CONFIRMADO)
REVOKE ALL ON FUNCTION public.sec_is_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sec_is_admin() TO anon, authenticated;
-- Los privilegios de has_role NO se modifican.

-- ============ C.2 Empresas ============
CREATE TABLE public.sec_companies (
  cik           text PRIMARY KEY CHECK (cik ~ '^[0-9]{10}$'),
  entity_name   text NOT NULL,
  is_published  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============ C.3 Tickers (cargados desde company_tickers.json FUERA del registro de corridas) ============
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

-- ============ C.4 Corridas: una por recurso descargado ============
CREATE TABLE public.sec_ingestion_runs (
  run_id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cik                  text NOT NULL REFERENCES public.sec_companies(cik) ON DELETE RESTRICT,
  resource_kind        text NOT NULL CHECK (resource_kind IN ('submissions','companyfacts')),
  endpoint_url         text NOT NULL,
  status               text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz,
  http_status          integer CHECK (http_status BETWEEN 100 AND 599),
  content_type         text,
  payload_bytes        bigint CHECK (payload_bytes >= 0),
  payload_sha256       bytea CHECK (payload_sha256 IS NULL OR octet_length(payload_sha256) = 32),
  storage_bucket       text,    -- siempre NULL en M1.1 (B8)
  storage_path         text,    -- siempre NULL en M1.1 (B8)
  user_agent           text NOT NULL,
  payload_fact_count   integer CHECK (payload_fact_count >= 0),     -- hechos parseados del payload
  facts_inserted       integer NOT NULL DEFAULT 0 CHECK (facts_inserted >= 0),
  observations_written integer NOT NULL DEFAULT 0 CHECK (observations_written >= 0),
  facts_rejected       integer NOT NULL DEFAULT 0 CHECK (facts_rejected >= 0),
  conflicts            integer NOT NULL DEFAULT 0 CHECK (conflicts >= 0),
  error_message        text,
  initiated_by         uuid,
  UNIQUE (cik, run_id),
  CHECK (endpoint_url = CASE resource_kind
           WHEN 'submissions'  THEN 'https://data.sec.gov/submissions/CIK' || cik || '.json'
           WHEN 'companyfacts' THEN 'https://data.sec.gov/api/xbrl/companyfacts/CIK' || cik || '.json'
         END),
  CHECK (storage_bucket IS NULL AND storage_path IS NULL),   -- se relaja en M1.3
  CHECK ((status = 'running') = (finished_at IS NULL)),
  CHECK (status <> 'completed' OR (
           http_status = 200 AND payload_sha256 IS NOT NULL AND payload_bytes IS NOT NULL
           AND payload_fact_count IS NOT NULL
           AND observations_written = payload_fact_count
           AND facts_rejected = 0 AND conflicts = 0)),
  CHECK (status <> 'failed' OR error_message IS NOT NULL)
);

-- ============ C.5 Filings ============
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

-- ============ C.6 Raw facts (identidad lógica; append-only) ============
CREATE TABLE public.sec_raw_facts (
  fact_hash          bytea PRIMARY KEY CHECK (octet_length(fact_hash) = 32),
  fact_hash_version  smallint NOT NULL DEFAULT 1 CHECK (fact_hash_version = 1),
  cik                text NOT NULL,
  accession_number   text NOT NULL,
  taxonomy_ns        text NOT NULL,   -- URI completa
  taxonomy_prefix    text NOT NULL,   -- clave de companyfacts ('us-gaap','dei',...); solo presentación
  tag                text NOT NULL,
  unit               text,            -- nullable (texto DEI sin unidad)
  period_type        text NOT NULL CHECK (period_type IN ('instant','duration')),
  period_start       date,
  period_end         date NOT NULL,
  value_kind         text NOT NULL CHECK (value_kind IN ('numeric','text','nil')),
  value_numeric      numeric,
  value_text         text,
  fiscal_year        integer,         -- metadata SEC original (fy), nullable
  fiscal_period      text,            -- metadata SEC original (fp), nullable, sin reglas de M1.2
  first_run_id       uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cik, fact_hash),
  FOREIGN KEY (cik, accession_number) REFERENCES public.sec_filings(cik, accession_number) ON DELETE RESTRICT,
  FOREIGN KEY (cik, first_run_id) REFERENCES public.sec_ingestion_runs(cik, run_id) ON DELETE RESTRICT,
  CHECK ((period_type = 'instant'  AND period_start IS NULL) OR
         (period_type = 'duration' AND period_start IS NOT NULL AND period_start <= period_end)),
  CHECK ((value_kind = 'numeric' AND value_numeric IS NOT NULL AND value_text IS NULL AND unit IS NOT NULL) OR
         (value_kind = 'text'    AND value_text IS NOT NULL AND value_numeric IS NULL) OR
         (value_kind = 'nil'     AND value_text IS NULL AND value_numeric IS NULL)),
  CHECK (value_numeric IS NULL OR value_numeric NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric))
);

-- ============ C.7 Observaciones (append-only) ============
CREATE TABLE public.sec_raw_fact_observations (
  observation_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cik              text NOT NULL,
  raw_fact_hash    bytea NOT NULL,
  run_id           uuid NOT NULL,
  frame            text,
  form             text,
  filed_date       date,
  raw_json         jsonb NOT NULL,   -- representación semántica del objeto; NO son los bytes originales
  raw_json_sha256  bytea NOT NULL CHECK (octet_length(raw_json_sha256) = 32),  -- hash del JSON canónico (D.3)
  conflict         boolean NOT NULL DEFAULT false,
  conflict_detail  jsonb,
  observed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (run_id, raw_fact_hash, frame, form, filed_date),
  FOREIGN KEY (cik, raw_fact_hash) REFERENCES public.sec_raw_facts(cik, fact_hash) ON DELETE RESTRICT,
  FOREIGN KEY (cik, run_id) REFERENCES public.sec_ingestion_runs(cik, run_id) ON DELETE RESTRICT,
  CHECK (conflict = (conflict_detail IS NOT NULL))
);

-- ============ C.8 Normalized facts (versionados) ============
CREATE TABLE public.sec_normalized_facts (
  normalized_fact_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cik                     text NOT NULL REFERENCES public.sec_companies(cik) ON DELETE RESTRICT,
  logical_key             text NOT NULL,   -- identidad lógica: concepto|unidad|periodo|accn (definida en M1.2)
  accession_number        text NOT NULL,
  canonical_concept       text NOT NULL,
  unit                    text NOT NULL,
  period_type             text NOT NULL CHECK (period_type IN ('instant','duration')),
  period_start            date,
  period_end              date NOT NULL,
  value_numeric           numeric NOT NULL
                          CHECK (value_numeric NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
  sec_fiscal_year         integer,         -- metadata SEC original
  sec_fiscal_period       text,
  resolved_fiscal_year    integer,         -- lo rellena M1.2; NULL en M1.1
  resolved_fiscal_period  text,
  normalizer_version      text NOT NULL,
  rule_version            text NOT NULL,
  source_run_id           uuid NOT NULL,   -- debe ser una corrida 'completed' (trigger)
  is_current              boolean NOT NULL DEFAULT true,
  superseded_by           uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cik, normalized_fact_id),
  UNIQUE (cik, logical_key, normalized_fact_id),
  UNIQUE (cik, logical_key, normalizer_version, rule_version),
  FOREIGN KEY (cik, accession_number) REFERENCES public.sec_filings(cik, accession_number) ON DELETE RESTRICT,
  FOREIGN KEY (cik, source_run_id) REFERENCES public.sec_ingestion_runs(cik, run_id) ON DELETE RESTRICT,
  -- supersession restringida a la misma empresa y la misma identidad lógica
  FOREIGN KEY (cik, logical_key, superseded_by)
    REFERENCES public.sec_normalized_facts(cik, logical_key, normalized_fact_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CHECK (superseded_by IS NULL OR superseded_by <> normalized_fact_id),
  CHECK (is_current = (superseded_by IS NULL)),
  CHECK ((period_type = 'instant'  AND period_start IS NULL) OR
         (period_type = 'duration' AND period_start IS NOT NULL AND period_start <= period_end))
);
CREATE UNIQUE INDEX sec_norm_current_uq ON public.sec_normalized_facts(cik, logical_key) WHERE is_current;

-- ============ C.9 Linaje normalizado -> raw ============
CREATE TABLE public.sec_normalized_fact_sources (
  cik                 text NOT NULL,
  normalized_fact_id  uuid NOT NULL,
  raw_fact_hash       bytea NOT NULL,
  role                text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','component','fallback')),
  PRIMARY KEY (cik, normalized_fact_id, raw_fact_hash),
  FOREIGN KEY (cik, normalized_fact_id) REFERENCES public.sec_normalized_facts(cik, normalized_fact_id) ON DELETE RESTRICT,
  FOREIGN KEY (cik, raw_fact_hash) REFERENCES public.sec_raw_facts(cik, fact_hash) ON DELETE RESTRICT
);

CREATE INDEX sec_raw_facts_lookup ON public.sec_raw_facts(cik, tag, period_end);
CREATE INDEX sec_obs_run          ON public.sec_raw_fact_observations(cik, run_id);
CREATE INDEX sec_norm_lookup      ON public.sec_normalized_facts(cik, canonical_concept, period_end) WHERE is_current;

-- ============ C.10 Triggers y funciones de servidor ============
CREATE TRIGGER sec_companies_updated_at BEFORE UPDATE ON public.sec_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mutaciones (UPDATE/DELETE/TRUNCATE) según la tabla
CREATE FUNCTION public.sec_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION '%: % forbidden', TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'sec_ingestion_runs' THEN
    IF OLD.status <> 'running' THEN
      RAISE EXCEPTION 'run already finalised' USING ERRCODE = '42501'; END IF;
    IF (NEW.run_id, NEW.cik, NEW.resource_kind, NEW.endpoint_url, NEW.started_at, NEW.user_agent)
       IS DISTINCT FROM (OLD.run_id, OLD.cik, OLD.resource_kind, OLD.endpoint_url, OLD.started_at, OLD.user_agent) THEN
      RAISE EXCEPTION 'run identity immutable' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'sec_normalized_facts' THEN
    -- solo se permite retirar la versión actual hacia una versión nueva de la misma identidad
    IF (to_jsonb(NEW) - 'is_current' - 'superseded_by') <> (to_jsonb(OLD) - 'is_current' - 'superseded_by')
       OR NOT (OLD.is_current AND NOT NEW.is_current AND NEW.superseded_by IS NOT NULL) THEN
      RAISE EXCEPTION 'only supersession allowed' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '%: UPDATE forbidden (append-only)', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;

-- Invariantes de INSERT
CREATE FUNCTION public.sec_insert_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r_status text; old_ver record;
BEGIN
  IF TG_TABLE_NAME IN ('sec_raw_facts','sec_filings') THEN
    SELECT status INTO r_status FROM public.sec_ingestion_runs WHERE run_id = NEW.first_run_id;
    IF r_status IS DISTINCT FROM 'running' THEN
      RAISE EXCEPTION 'writes require a running run' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'sec_raw_fact_observations' THEN
    SELECT status INTO r_status FROM public.sec_ingestion_runs WHERE run_id = NEW.run_id;
    IF r_status IS DISTINCT FROM 'running' THEN
      RAISE EXCEPTION 'observations require a running run' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'sec_normalized_facts' THEN
    SELECT status INTO r_status FROM public.sec_ingestion_runs WHERE run_id = NEW.source_run_id;
    IF r_status IS DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION 'normalization requires a completed run' USING ERRCODE = '23514'; END IF;
    IF NOT NEW.is_current THEN
      RAISE EXCEPTION 'new versions must be inserted as current' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'sec_normalized_fact_sources' THEN
    -- el raw fact debe haberse observado en la corrida completed origen del normalized fact
    IF NOT EXISTS (
      SELECT 1 FROM public.sec_normalized_facts n
      JOIN public.sec_raw_fact_observations o
        ON o.cik = n.cik AND o.run_id = n.source_run_id AND o.raw_fact_hash = NEW.raw_fact_hash
      WHERE n.cik = NEW.cik AND n.normalized_fact_id = NEW.normalized_fact_id) THEN
      RAISE EXCEPTION 'lineage must come from the source run' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- La supersession debe apuntar a una versión creada después y con versión distinta (comprobado al COMMIT)
CREATE FUNCTION public.sec_supersession_check() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE tgt public.sec_normalized_facts%ROWTYPE;
BEGIN
  IF NEW.superseded_by IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO tgt FROM public.sec_normalized_facts WHERE normalized_fact_id = NEW.superseded_by;
  IF tgt.cik <> NEW.cik OR tgt.logical_key <> NEW.logical_key
     OR NOT tgt.is_current
     OR tgt.created_at < NEW.created_at
     OR (tgt.normalizer_version, tgt.rule_version) = (NEW.normalizer_version, NEW.rule_version) THEN
    RAISE EXCEPTION 'supersession must target a newer current version of the same identity'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER sec_runs_guard      BEFORE UPDATE OR DELETE ON public.sec_ingestion_runs          FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_filings_guard   BEFORE UPDATE OR DELETE ON public.sec_filings                 FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_raw_guard       BEFORE UPDATE OR DELETE ON public.sec_raw_facts               FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_obs_guard       BEFORE UPDATE OR DELETE ON public.sec_raw_fact_observations   FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_norm_guard      BEFORE UPDATE OR DELETE ON public.sec_normalized_facts        FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_src_guard       BEFORE UPDATE OR DELETE ON public.sec_normalized_fact_sources FOR EACH ROW EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_runs_trunc      BEFORE TRUNCATE ON public.sec_ingestion_runs          FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_filings_trunc   BEFORE TRUNCATE ON public.sec_filings                 FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_raw_trunc       BEFORE TRUNCATE ON public.sec_raw_facts               FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_obs_trunc       BEFORE TRUNCATE ON public.sec_raw_fact_observations   FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_norm_trunc      BEFORE TRUNCATE ON public.sec_normalized_facts        FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_src_trunc       BEFORE TRUNCATE ON public.sec_normalized_fact_sources FOR EACH STATEMENT EXECUTE FUNCTION public.sec_guard();
CREATE TRIGGER sec_filings_ins     BEFORE INSERT ON public.sec_filings                 FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE TRIGGER sec_raw_ins         BEFORE INSERT ON public.sec_raw_facts               FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE TRIGGER sec_obs_ins         BEFORE INSERT ON public.sec_raw_fact_observations   FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE TRIGGER sec_norm_ins        BEFORE INSERT ON public.sec_normalized_facts        FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE TRIGGER sec_src_ins         BEFORE INSERT ON public.sec_normalized_fact_sources FOR EACH ROW EXECUTE FUNCTION public.sec_insert_guard();
CREATE CONSTRAINT TRIGGER sec_norm_supersession AFTER UPDATE ON public.sec_normalized_facts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.sec_supersession_check();

-- Cierre de corrida: valida conteos reales antes de pasar a completed
CREATE FUNCTION public.sec_finalize_run(_run_id uuid, _payload_fact_count integer)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.sec_ingestion_runs%ROWTYPE; n_obs integer; n_conf integer;
BEGIN
  SELECT * INTO r FROM public.sec_ingestion_runs WHERE run_id = _run_id FOR UPDATE;
  IF r.status IS DISTINCT FROM 'running' THEN RAISE EXCEPTION 'run not running'; END IF;
  SELECT count(*), count(*) FILTER (WHERE conflict) INTO n_obs, n_conf
    FROM public.sec_raw_fact_observations WHERE cik = r.cik AND run_id = _run_id;
  IF n_obs = _payload_fact_count AND n_conf = 0 AND r.facts_rejected = 0
     AND r.payload_sha256 IS NOT NULL AND r.http_status = 200 THEN
    UPDATE public.sec_ingestion_runs
      SET status = 'completed', finished_at = now(),
          payload_fact_count = _payload_fact_count, observations_written = n_obs, conflicts = 0
      WHERE run_id = _run_id;
    RETURN 'completed';
  ELSE
    UPDATE public.sec_ingestion_runs
      SET status = 'failed', finished_at = now(),
          payload_fact_count = _payload_fact_count, observations_written = n_obs, conflicts = n_conf,
          error_message = format('finalize mismatch: obs=%s expected=%s conflicts=%s rejected=%s',
                                 n_obs, _payload_fact_count, n_conf, r.facts_rejected)
      WHERE run_id = _run_id;
    RETURN 'failed';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.sec_guard(), public.sec_insert_guard(), public.sec_supersession_check(),
  public.sec_finalize_run(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sec_finalize_run(uuid, integer) TO service_role;

-- ============ C.11 GRANT (capa 1). REVOKE primero por los default privileges (A.1) ============
REVOKE ALL ON public.sec_companies, public.sec_ticker_mappings, public.sec_ingestion_runs,
  public.sec_filings, public.sec_raw_facts, public.sec_raw_fact_observations,
  public.sec_normalized_facts, public.sec_normalized_fact_sources
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.sec_companies, public.sec_ticker_mappings, public.sec_filings,
  public.sec_normalized_facts TO anon, authenticated;
GRANT SELECT ON public.sec_ingestion_runs, public.sec_raw_facts, public.sec_raw_fact_observations,
  public.sec_normalized_fact_sources TO authenticated;          -- filtrado a admin por RLS

GRANT SELECT, INSERT, UPDATE ON public.sec_companies, public.sec_ticker_mappings,
  public.sec_ingestion_runs, public.sec_normalized_facts TO service_role;
GRANT SELECT, INSERT ON public.sec_filings, public.sec_raw_facts,
  public.sec_raw_fact_observations, public.sec_normalized_fact_sources TO service_role;
-- Nadie recibe DELETE ni TRUNCATE. Sin secuencias (todas las PK son uuid/bytea/text).

-- ============ C.12 RLS (capa 2) ============
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
  USING (EXISTS (SELECT 1 FROM public.sec_companies c WHERE c.cik = sec_ticker_mappings.cik AND c.is_published)
         OR public.sec_is_admin());
CREATE POLICY sec_filings_read ON public.sec_filings FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.sec_companies c WHERE c.cik = sec_filings.cik AND c.is_published)
         OR public.sec_is_admin());
CREATE POLICY sec_norm_read ON public.sec_normalized_facts FOR SELECT TO anon, authenticated
  USING ((is_current AND EXISTS (SELECT 1 FROM public.sec_companies c
                                 WHERE c.cik = sec_normalized_facts.cik AND c.is_published))
         OR public.sec_is_admin());
CREATE POLICY sec_runs_admin    ON public.sec_ingestion_runs          FOR SELECT TO authenticated USING (public.sec_is_admin());
CREATE POLICY sec_raw_admin     ON public.sec_raw_facts               FOR SELECT TO authenticated USING (public.sec_is_admin());
CREATE POLICY sec_obs_admin     ON public.sec_raw_fact_observations   FOR SELECT TO authenticated USING (public.sec_is_admin());
CREATE POLICY sec_sources_admin ON public.sec_normalized_fact_sources FOR SELECT TO authenticated USING (public.sec_is_admin());
-- No hay políticas INSERT/UPDATE/DELETE ni FOR ALL. service_role (BYPASSRLS) queda limitado por C.11 y C.10.
```

### C.13 Contrato de ingesta (función de backend `sec-ingest`; solo contrato en M1.1)
**Recursos registrados:** solo `submissions` y `companyfacts`, por CIK, con la URL exacta que fija el CHECK. `company_tickers.json` (www.sec.gov) se carga en `sec_ticker_mappings` **fuera** de este registro: M1.1 no audita esa descarga.

**Atomicidad (contrato único):**
1. Se verifica el JWT y `sec_is_admin()` con el token del llamante. Si falla, 403 y no se crea corrida.
2. `INSERT` de la corrida con `status='running'`, como transacción propia.
3. Descarga. `payload_sha256` = SHA-256 de los **bytes exactos del cuerpo HTTP**, calculado antes de cualquier parseo. Se guardan también `http_status`, `content_type` y `payload_bytes`. Si el estado no es 200, la corrida pasa a `failed` (el hash puede quedar NULL).
4. Validación de la estructura: cada objeto de hecho solo puede tener las claves `start, end, val, accn, fy, fp, form, filed, frame`. Ante cualquier otra clave (incluidas las dimensionales) se incrementa `facts_rejected`, el hecho **no se hashea ni se inserta** y la corrida terminará en `failed`.
5. Commits por lotes (p. ej. 500 hechos). Cada lote es una transacción idempotente:
   - filings: `INSERT ... ON CONFLICT (cik, accession_number) DO NOTHING`;
   - raw fact: `INSERT ... ON CONFLICT (fact_hash) DO NOTHING RETURNING`. Si no devuelve fila, se lee la existente y se comparan **todos** los campos almacenados: identidad, `taxonomy_prefix`, `fiscal_year`, `fiscal_period` y `accession_number`. Una diferencia genera una observación con `conflict=true`;
   - observación: `INSERT ... ON CONFLICT ON CONSTRAINT <unique NULLS NOT DISTINCT> DO NOTHING`.
6. Ante una excepción a mitad, la corrida pasa a `failed` con `error_message`. Los lotes ya confirmados **permanecen** vinculados a esa corrida fallida. El trigger de inserción impide añadir más filas a una corrida que ya no está en `running`.
7. Cierre: `sec_finalize_run(run_id, payload_fact_count)` recuenta las observaciones reales y pasa la corrida a `completed` solo si todo cuadra; si no, a `failed`.
8. Reintento: siempre con una **corrida nueva**. Los raw facts existentes no se duplican (PK `fact_hash`) y la nueva corrida escribe sus propias observaciones.
9. La normalización (M1.2) solo puede usar corridas `completed` (trigger). Una corrida fallida nunca se normaliza ni se publica.
10. `completed` en M1.1 = descargado, hasheado, procesado y validado. **No** significa que el payload esté archivado o sea recuperable; eso llega con el almacenamiento de M1.3.

---

## D. Fact hash v1 y vectores

### D.1 Especificación
```text
fact_hash = SHA-256( DOMAIN
  || S(cik) || S(accn) || S(taxonomy_ns) || S(tag) || S(unit)
  || S(period_type) || Dt(period_start) || Dt(period_end)
  || K(value_kind) || V(value) )
DOMAIN = ASCII "navaroli.sec.fact_hash.v1" || 0x00
TLV    = type:uint8 || len:uint32 big-endian || bytes
type   0x00 NULL (len 0) | 0x01 string | 0x02 date | 0x03 decimal | 0x04 enum
S(x)   NULL -> 0x00 ; otherwise 0x01 + UTF-8(NFC(x))
Dt(x)  NULL -> 0x00 ; otherwise 0x02 + "YYYY-MM-DD"
K      0x04 + "N" | "T" | "X"   (numeric | text | nil)
V      N -> 0x03 + canonical decimal ; T -> S(text) ; X -> 0x00
```
- **Decimal canónico:** se parsea el lexema; nunca se usa float. Sin exponente, sin `+`, sin ceros a la izquierda, sin ceros finales tras el punto y sin punto si el valor es entero. `-0` → `0`. `NaN` e `Infinity` se rechazan (no son valores SEC válidos).
- **Normalización de campos:** `cik` de 10 dígitos; `accn` `NNNNNNNNNN-NN-NNNNNN`; `taxonomy_ns` URI completa; `tag` y `unit` exactos, distinguiendo mayúsculas; `unit` puede ser NULL; instant ⇒ `period_start` NULL.
- **Sin campo de dimensiones en v1.** Los hechos dimensionales se rechazan antes de hashear (C.13.4). Admitirlos en M1.3 exigirá un hash v2, sin reinterpretar los v1.
- Excluidos de la identidad: `frame`, `fy`, `fp`, `form`, `filed`.

### D.2 Hashes de payload y de JSON canónico (no intercambiables)
- `payload_sha256`: SHA-256 de los bytes del cuerpo HTTP tal como llegaron. Identifica el **recurso descargado**.
- `raw_json_sha256`: SHA-256 de la serialización canónica del objeto del hecho: claves ordenadas, sin espacios, UTF-8 NFC, números con el decimal canónico de D.1. Representa el **contenido semántico**, no los bytes originales.
- `raw_json` (JSONB) no conserva los bytes, el orden ni el lexema numérico originales. **No es una copia exacta** del payload.
- `fact_hash` identifica el **hecho lógico**.

### D.3 Vectores: comunes a todos salvo indicación
`cik=0000320193`, `accn=0000320193-24-000123`, `taxonomy_ns=http://fasb.org/us-gaap/2024`, `tag=Revenues`, `unit=USD`, duration `2023-10-01..2024-09-28`.

| ID | Variación | SHA-256 (64 hex) | Relación |
|---|---|---|---|
| V01 | N `1` | `478bc74bc6b22bbd6a49ebc7f2d8ab6fd55107a8a6f8f91670f7a9d1db0ece54` | = V02 |
| V02 | N `1.0` | `478bc74bc6b22bbd6a49ebc7f2d8ab6fd55107a8a6f8f91670f7a9d1db0ece54` | = V01 |
| V03 | N `-0` | `398fe1da33b091d119af6be02ceeb53fa4c6d404221f510aa6305b877caa5ee3` | = V04 |
| V04 | N `0.000` | `398fe1da33b091d119af6be02ceeb53fa4c6d404221f510aa6305b877caa5ee3` | = V03 |
| V05 | T literal `NONE` | `cd3a86cebddcba8e9e67a115637c43bf1894647c43e702fcd573a3e065930bdd` | ≠ V06 |
| V06 | nil | `ecea7b52d0fb4ecc8af16492173a852a8dfbb00ba0107fd7f3cd7723086ef285` | ≠ V05 |
| V07 | T `Café` (NFC) | `c13d966b87291a323327f53caf59af94665502f364018df6d36ff2fe3e0292b7` | = V08 |
| V08 | T `Cafe\u0301` (NFD) | `c13d966b87291a323327f53caf59af94665502f364018df6d36ff2fe3e0292b7` | = V07 |
| V09 | N `1.25E3` | `16fa11f4899348e29ae4d5ca68fbdfdff0378f4d428694cf1ac2837244829de8` | = V10 |
| V10 | N `1250.00` | `16fa11f4899348e29ae4d5ca68fbdfdff0378f4d428694cf1ac2837244829de8` | = V09 |
| V11 | instant, start NULL, N `1` | `2ae63dfd8c200843f0b8f7aa1e28c50c0ada3672ef71ab82db89bf2ae21bf62b` | ≠ V01 |
| V12 | dei `EntityRegistrantName`, T `Apple Inc.`, **unit NULL** | `95cfad5a2aec4641b35c2571e5be4e4271187f8af123bf792f478873bc29c254` | ≠ V13 |
| V13 | igual que V12 con unit `pure` | `54800ad92ab44dfd50a14c0d0b3e79c35c947e2b7000f8650ac4458b952997a9` | ≠ V12 |
| V14 | N `-0.0500` (canónico `-0.05`) | `9fd306f5ebe6595313db06ad9ff99e55f1ecc5009c40d39b3cbb0c843b0880d5` | — |
| V15 | N `391035000000` | `a80a1b98a56b797c190c6746c3e18321a405bd7bc2def96a98279ee1f2f464f5` | — |

### D.4 Evidencia de ejecución (este turno)
- Python 3.13.15 (`hashlib`, `unicodedata`, `decimal.Decimal`, `struct`) y Bun 1.4.4 (`crypto`, `String.normalize`, parser decimal propio por regex, sin `Number`). Son dos implementaciones independientes.
- Cada una se ejecutó desde línea de comandos sin escribir archivos; los vectores se pasaron por la variable de entorno `VJSON`.
- Resultado: las 15 líneas de salida son idénticas. `DIFF: empty (identical)`.
- **Alcance de la evidencia:** solo prueba que dos implementaciones del algoritmo coinciden. **No** valida ningún test de base de datos.

Python de referencia (ejecutado):
```python
import hashlib,unicodedata,json,struct,os
from decimal import Decimal
DOM=b"navaroli.sec.fact_hash.v1\x00"
def tlv(t,b): return bytes([t])+struct.pack(">I",len(b))+b
def s(x): return tlv(0,b"") if x is None else tlv(1,unicodedata.normalize("NFC",x).encode())
def d(x): return tlv(0,b"") if x is None else tlv(2,x.encode())
def dec(x):
    v=Decimal(x)
    if not v.is_finite(): raise ValueError("non-finite")
    if v.is_zero(): c="0"
    else:
        sign,dg,e=v.normalize().as_tuple(); g="".join(map(str,dg))
        if e>=0: c=g+"0"*e
        else:
            n=len(g)+e; c=(g[:n] if n>0 else "0")+"."+("0"*(-n) if n<0 else "")+g[max(n,0):]
        if sign: c="-"+c
    return tlv(3,c.encode())
def val(f):
    k=f["vkind"]; return tlv(4,k.encode())+(dec(f["val"]) if k=="N" else s(f["val"]) if k=="T" else tlv(0,b""))
def h(f): return hashlib.sha256(DOM+s(f["cik"])+s(f["accn"])+s(f["ns"])+s(f["tag"])+s(f["unit"])+s(f["ptype"])+d(f["start"])+d(f["end"])+val(f)).hexdigest()
for k,f in json.loads(os.environ["VJSON"]).items(): print(k,h(f))
```

TypeScript/Bun independiente (ejecutado):
```ts
const {createHash}=require("crypto");
const E=Buffer.alloc(0),DOM=Buffer.from("navaroli.sec.fact_hash.v1\0");
const tlv=(t,b)=>{const h=Buffer.alloc(5);h[0]=t;h.writeUInt32BE(b.length,1);return Buffer.concat([h,b]);};
const s=x=>x===null?tlv(0,E):tlv(1,Buffer.from(x.normalize("NFC"),"utf8"));
const d=x=>x===null?tlv(0,E):tlv(2,Buffer.from(x));
function dec(x){const m=/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(x);if(!m||!(m[2]||m[3]))throw Error("bad decimal");
 let g=(m[2]||"")+(m[3]||""),e=(m[4]?+m[4]:0)-(m[3]||"").length;g=g.replace(/^0+/,"");while(g.endsWith("0")){g=g.slice(0,-1);e++;}
 let c;if(!g)c="0";else{if(e>=0)c=g+"0".repeat(e);else{const n=g.length+e;c=(n>0?g.slice(0,n):"0")+"."+(n<0?"0".repeat(-n):"")+g.slice(Math.max(n,0));}if(m[1]==="-")c="-"+c;}
 return tlv(3,Buffer.from(c));}
const val=f=>Buffer.concat([tlv(4,Buffer.from(f.vkind)),f.vkind==="N"?dec(f.val):f.vkind==="T"?s(f.val):tlv(0,E)]);
for(const [k,f] of Object.entries(JSON.parse(process.env.VJSON)))console.log(k,createHash("sha256").update(Buffer.concat([DOM,s(f.cik),s(f.accn),s(f.ns),s(f.tag),s(f.unit),s(f.ptype),d(f.start),d(f.end),val(f)])).digest("hex"));
```

Comando ejecutado (`VJSON` generado con los quince vectores de D.3; claves `cik, accn, ns, tag, unit, ptype, start, end, vkind, val`):
```bash
P=$(python3 -c "$PY"); T=$(bun -e "$TS")
[ "$P" = "$T" ] && echo "DIFF: empty (identical)" || diff <(echo "$P") <(echo "$T")
```
En Build se guardarán como `validation/fnd001/fact_hash.py`, `validation/fnd001/factHash.ts` y `validation/fnd001/vectors.json` (esperados = tabla D.3).

---

## E. Tests (todos NOT RUN)
Aislamiento: cada suite SQL va dentro de `BEGIN; ... ROLLBACK;`, en una base de draft o local con la migración aplicada. Se usan los CIK sintéticos `9999999901` y `9999999902` y ningún dato productivo. Las suites de acceso crean y borran sus usuarios de prueba (uno admin y uno no-admin) mediante el harness.

| # | Test | Esperado | Estado |
|---|---|---|---|
| T1 | Filing de A con `first_run_id` de una corrida de B | 23503 | NOT RUN |
| T2 | Raw fact de A con filing de B; observación de A con corrida de B | 23503 | NOT RUN |
| T3 | Normalized de A con filing de B; fuente (A, normalized de A, raw de B) | 23503 | NOT RUN |
| T4 | Tipo de valor: numeric con texto; numeric sin unit; text sin texto; text con número; nil con valor; combinaciones válidas (numeric+unit, **text+unit NULL**, nil) | inválidas 23514, válidas OK | NOT RUN |
| T5 | Periodo: instant con start; duration sin start; start > end | 23514 | NOT RUN |
| T6 | `value_numeric` = `NaN`, `Infinity`, `-Infinity` | 23514 | NOT RUN |
| T7 | Precisión: `123456789012345678901234.123456789` se lee de vuelta igual | igualdad | NOT RUN |
| T8 | `UNIQUE NULLS NOT DISTINCT`: dos observaciones idénticas con `frame` NULL en la misma corrida | 23505 | NOT RUN |
| T9 | Dos corridas con UUID distintos y el mismo hecho | 1 raw fact, 2 observaciones | NOT RUN |
| T10 | Mismo `fact_hash` con `fiscal_period` distinto | `conflict=true`; `sec_finalize_run` devuelve `failed` | NOT RUN |
| T11 | UPDATE, DELETE y TRUNCATE sobre raw facts, observaciones, fuentes y filings, como service_role | 42501 (trigger) | NOT RUN |
| T12 | Normalized: UPDATE del valor rechazado; DELETE rechazado; supersession válida aceptada dentro de una transacción | 42501 / OK | NOT RUN |
| T13 | Supersession hacia otra empresa | 23503 (FK compuesta) | NOT RUN |
| T14 | Supersession hacia otro `logical_key` de la misma empresa | 23503 | NOT RUN |
| T15 | Supersession hacia una versión más antigua o con la misma versión | 23514 al COMMIT | NOT RUN |
| T16 | Corrida: forzar `completed` sin hash; reabrir una finalizada; cambiar el endpoint; endpoint que no corresponde a `resource_kind`/CIK | 23514 / 42501 | NOT RUN |
| T17 | Fallo a mitad: lote 1 confirmado, excepción en el lote 2 → `failed` con observaciones parciales; insertar más en esa corrida → 23514; reintento con corrida nueva → sin raw facts duplicados y `completed` | según contrato C.13 | NOT RUN |
| T18 | Normalizar desde una corrida `failed` o `running` | 23514 | NOT RUN |
| T19 | Hecho con una clave fuera de la allowlist (p. ej. `segment`) | rechazado, sin hash, corrida `failed` | NOT RUN |
| T20 | `sec_is_admin()`: anon = false; authenticated no-admin = false; admin = true; sesión sin UID (`request.jwt.claims` vacío) = false | según valores | NOT RUN |
| T21 | RLS: anon y no-admin ven solo empresas publicadas, sus filings y sus normalized vigentes; 0 filas privadas; INSERT/UPDATE → 42501. El admin lee todo y su DML → 42501. service_role: INSERT OK, DELETE → 42501 | según valores | NOT RUN |
| T22 | `payload_sha256` de un fixture binario = `sha256sum` del archivo; `raw_json_sha256` estable aunque cambie el orden de las claves | igualdad | NOT RUN |

Comandos previstos (NOT RUN):
```bash
psql -v ON_ERROR_STOP=1 -f validation/fnd001/sql/t01_t19.sql          # BEGIN ... ROLLBACK
bunx vitest run validation/fnd001/access.test.ts                       # T20-T21 con JWT reales
bunx vitest run validation/fnd001/ingest.test.ts validation/fnd001/payload.test.ts   # T10, T17, T19, T22
python3 validation/fnd001/fact_hash.py > /tmp/py.txt && bun validation/fnd001/factHash.ts > /tmp/ts.txt && diff /tmp/py.txt /tmp/ts.txt
```

---

## F. Preflight y trazabilidad

### F.1 Preflight de solo lectura (se repite justo antes de migrar)
```sql
SELECT current_setting('server_version');                                         -- CONFIRMADO 17.6
SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND relname LIKE 'sec\_%';                              -- CONFIRMADO 0 filas
SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace
  AND proname IN ('sec_is_admin','sec_guard','sec_insert_guard','sec_supersession_check','sec_finalize_run');  -- CONFIRMADO sec_is_admin ausente
SELECT pg_get_function_result(p.oid), provolatile, prosecdef, proconfig, proowner::regrole
  FROM pg_proc p WHERE p.oid='public.has_role(uuid,public.app_role)'::regprocedure;  -- CONFIRMADO boolean,s,t,{search_path=public},postgres
SELECT r, has_function_privilege(r,'public.has_role(uuid,public.app_role)','EXECUTE')
  FROM unnest(ARRAY['anon','authenticated','postgres']) r;                          -- CONFIRMADO f,t,t
SELECT has_function_privilege('postgres','auth.uid()','EXECUTE');                  -- NOT VERIFIED (sin acceso al esquema auth)
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE typname='app_role';  -- CONFIRMADO admin,user
SELECT defaclrole::regrole, defaclobjtype, defaclacl FROM pg_default_acl;          -- CONFIRMADO grants amplios -> REVOKE obligatorio
-- Después de migrar (en el draft): comprobar el propietario y el ACL de sec_is_admin
SELECT proowner::regrole, proacl, prosecdef, proconfig FROM pg_proc WHERE proname='sec_is_admin';
  -- esperado: postgres, {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}, t, {search_path=""}
```
Si aparece algún `sec_*`: se compararán `information_schema.columns`, `pg_constraint`, `pg_policies` y `pg_trigger` con la sección C, y se informará de las diferencias antes de decidir. No se aborta a ciegas.

### F.2 Matriz requisito → objeto → test
| Requisito | Objeto | Test |
|---|---|---|
| Esquema coherente, FK multiempresa | C.2–C.9 | T1–T3 |
| Tipos, periodos y NaN | CHECKs de C.6 y C.8 | T4–T7 |
| `NULLS NOT DISTINCT` | UNIQUE en C.7 | T8 |
| Reingesta idempotente | PK `fact_hash`, C.13 | T9, T17 |
| Conflictos | `conflict`, `sec_finalize_run` | T10 |
| Append-only | `sec_guard`, sin GRANT DELETE | T11 |
| Versionado y supersession | FK compuesta, `sec_guard`, `sec_supersession_check` | T12–T15 |
| Ciclo de vida de corridas y endpoint | CHECKs de C.4, `sec_guard` | T16 |
| Atomicidad | C.13, `sec_insert_guard` | T17 |
| Solo se normaliza lo completado | `sec_insert_guard` | T18 |
| Dimensiones fuera de M1.1 | allowlist de C.13.4 | T19 |
| Comprobación de admin | `sec_is_admin` | T20 |
| Mínimo privilegio y RLS | C.11, C.12 | T21 |
| Payload frente a JSON canónico | D.2 | T22 |
| Fact hash | D.1, D.3 | evidencia D.4 (diff vacío) |

---

## G. Riesgos residuales
1. La recuperación del payload no existe hasta M1.3, por diseño (B8).
2. No se ha confirmado el EXECUTE de `postgres` sobre `auth.uid()`. Si faltara, `sec_is_admin()` fallaría; T20 lo detectaría.
3. Que `companyfacts` contenga hechos textuales o nil no está observado; el diseño los soporta igualmente.
4. Un parser JSON sin pérdida en el entorno de la función de backend es requisito para hechos numéricos con más de 15 dígitos significativos. Elegir la dependencia queda para Build.
5. La definición exacta de `logical_key` corresponde a M1.2; M1.1 solo fija su papel estructural.
6. Ningún test de base de datos se ha ejecutado.

---

## H. Estado final
- **CONFIRMADO:** PostgreSQL 17.6 (admite `NULLS NOT DISTINCT`); no existen tablas `sec_*` ni `sec_is_admin`; definición y propietario de `has_role` (postgres); EXECUTE sobre `has_role`: anon=false, authenticated=true, postgres=true (sin cambios); etiquetas de `app_role`; default privileges amplios (REVOKE obligatorio); 15 vectores del fact hash v1 idénticos en Python y TypeScript (diff vacío).
- **NOT VERIFIED:** EXECUTE de `postgres` sobre `auth.uid()`; hechos textuales o nil reales en `companyfacts`.
- **NOT RUN:** T1–T22 (todos los tests de base de datos, acceso, ingesta y payload).
- FND-001 sigue **NOT STARTED**.

M1.1 remains NOT APPROVED; no implementation performed.
