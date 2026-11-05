# FND-001 / M1.1 — Auditoría adversarial y especificación canónica (NO BUILD)

Estado: FND-001 permanece NOT STARTED. Ningún archivo del proyecto, migración, DDL/DML, backend ni llamada a SEC ejecutados en este turno. Única escritura: este plan.

---

## A. Auditoría de la propuesta anterior

### A.1 Confirmado por inspección read-only (psql, este turno)
| Objeto | Resultado |
|---|---|
| `app_role` | existe, etiquetas `admin,user` |
| `public.has_role(_user_id uuid, _role app_role)` | retorna `boolean`, `STABLE` (s), `SECURITY DEFINER` (t), `search_path=public` |
| `public.update_updated_at_column()` | trigger, volatile, no definer, `search_path=public` |
| `public.user_roles` | columnas `id uuid, user_id uuid, role app_role, created_at timestamptz` |
| Extensiones | `pgcrypto 1.3`, `uuid-ossp 1.1` (`gen_random_uuid()` nativo PG13+) |
| `public.sec_*` | ninguna relación existe → sin colisiones |
| Default privileges | **defecto crítico**: los roles `postgres` y `supabase_admin` conceden por defecto `arwdDxtm` en tablas y `rwU` en secuencias a `anon` y `authenticated`. Toda tabla nueva debe empezar con `REVOKE ALL ... FROM anon, authenticated` explícito; si no, el mínimo privilegio solo dependería de RLS. |

### A.2 Defectos en la propuesta anterior (corregidos aquí)
1. Identificador de linaje inconsistente: `raw_fact_id` (BIGSERIAL) vs `raw_fact_hash`. → Canónico: `raw_fact_hash bytea(32)`; sin BIGSERIAL en ninguna parte.
2. Mezcla BIGSERIAL/UUID. → UUID (`gen_random_uuid()`) para filas sustitutas; `bytea` SHA-256 para identidades de contenido.
3. `sec_ingestion_runs` con columnas distintas entre DDL, tests y docs. → Una sola definición (C.3).
4. `GRANT ALL` / DML a `authenticated` y políticas `FOR ALL`. → Eliminados; cero DML desde navegador.
5. `ON CONFLICT DO NOTHING` sobre `fact_hash` ocultaba conflictos. → Comparación completa y registro de conflicto (C.6).
6. Fact hash con sentinels `"NONE"`/`"NULL"` y separador textual `|`. → Codificación TLV tipada (D).
7. `fiscal_year/fiscal_period NOT NULL` y reglas de periodo de M1.2 adelantadas. → Nullable; metadata SEC separada del periodo resuelto.
8. `ON DELETE CASCADE` desde empresa/filing hacia hechos. → `ON DELETE RESTRICT` en todas las FK de historia.
9. No se revocaban default privileges ni se trataban secuencias.
10. Tests descritos como comentarios. → Scripts ejecutables, todos NOT RUN.

### A.3 No verificable en este turno
- Hashes de vectores (plan mode bloqueó escribir scripts en /tmp): **NOT RUN, no verificados**.
- Comportamiento real de RLS con JWT reales.
- Formato exacto de dimensiones en el JSON de companyfacts: la API pública `companyfacts` **no expone dimensiones**; solo los XBRL de cada filing las tienen. La columna se diseña para M1.3; en M1.1 vale siempre NULL (ausente).
- Existencia de un bucket de archivo: no hay ninguno. No se inventa ninguno.

---

## B. Decisiones justificadas
| ID | Decisión | Motivo |
|---|---|---|
| B1 | 8 tablas, sin vistas públicas nuevas en M1.1 | Alcance mínimo; las vistas para la UI se diseñan con M1.4 |
| B2 | Toda escritura vía Edge Function `sec-ingest` (JWT + `has_role(admin)`) usando service role en servidor | Validación confiable; el navegador nunca escribe |
| B3 | Admin humano: solo SELECT vía RLS; sin DML | El histórico no se altera por acceso ordinario |
| B4 | Raw facts e observaciones append-only (REVOKE + trigger que también bloquea service_role) | La historia es inmutable incluso ante errores del backend; corregir = nueva observación o nueva versión normalizada |
| B5 | `decimals` y `frame` **fuera** de la identidad, guardados en la observación | `frame` lo asigna SEC después y puede reasignarlo entre descargas; `decimals` describe la precisión con que se informó, no el valor económico. Si se incluyeran, la misma cifra cambiaría de hash entre descargas |
| B6 | `fy`, `fp`, `form`, `filed` fuera de la identidad (pertenecen a filing/observación) | Son metadata del documento, no coordenadas del hecho |
| B7 | `1` y `1.0` producen el mismo hash (valor decimal exacto); la escala original se conserva en `raw_json` | Los números JSON de SEC no tienen escala semántica; igualdad de valor = mismo hecho |
| B8 | Archivo del payload diferido a M1.3; en M1.1 `storage_bucket/path` siempre NULL | **M1.1 no garantiza recuperación del payload**; solo guarda su hash y metadata HTTP |
| B9 | Normalized facts versionados: identidad lógica (`logical_key`) + versión (`normalizer_version`, `rule_version`); nunca se sobrescriben | Reproducibilidad al cambiar reglas |
| B10 | Publicación: filings y normalized facts son públicos solo si `sec_companies.is_published` | Un único interruptor por empresa (decisión D2) |

---

## C. Esquema y permisos canónicos (DDL único)

```sql
-- C.0 Preflight guard (aborta solo si hay colisión real; ver F.1 para diagnóstico previo)
DO $$ BEGIN
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'has_role(uuid,app_role) missing'; END IF;
END $$;

-- C.1 Empresas
CREATE TABLE public.sec_companies (
  cik            text PRIMARY KEY CHECK (cik ~ '^[0-9]{10}$'),
  entity_name    text NOT NULL,
  is_published   boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- C.2 Tickers (dual-class, histórico)
CREATE TABLE public.sec_ticker_mappings (
  ticker      text NOT NULL CHECK (ticker = upper(ticker) AND ticker ~ '^[A-Z0-9.\-]{1,10}$'),
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

-- C.3 Corridas: una por recurso descargado
CREATE TABLE public.sec_ingestion_runs (
  run_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cik              text NOT NULL REFERENCES public.sec_companies(cik) ON DELETE RESTRICT,
  resource_kind    text NOT NULL CHECK (resource_kind IN ('submissions','companyfacts')),
  endpoint_url     text NOT NULL CHECK (endpoint_url ~ '^https://data\.sec\.gov/'),
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  http_status      integer CHECK (http_status BETWEEN 100 AND 599),
  content_type     text,
  payload_bytes    bigint CHECK (payload_bytes >= 0),
  payload_sha256   bytea CHECK (payload_sha256 IS NULL OR octet_length(payload_sha256) = 32),
  storage_bucket   text,   -- siempre NULL en M1.1 (B8)
  storage_path     text,   -- siempre NULL en M1.1 (B8)
  user_agent       text NOT NULL,
  facts_inserted   integer NOT NULL DEFAULT 0 CHECK (facts_inserted >= 0),
  facts_observed   integer NOT NULL DEFAULT 0 CHECK (facts_observed >= 0),
  conflicts        integer NOT NULL DEFAULT 0 CHECK (conflicts >= 0),
  error_message    text,
  initiated_by     uuid,
  UNIQUE (cik, run_id),
  CHECK ((storage_bucket IS NULL) = (storage_path IS NULL)),
  CHECK (status = 'running' OR finished_at IS NOT NULL),
  CHECK (status <> 'completed' OR (payload_sha256 IS NOT NULL AND http_status = 200
                                   AND payload_bytes IS NOT NULL AND conflicts = 0)),
  CHECK (status <> 'failed' OR error_message IS NOT NULL)
);
-- Nota: en M1.3 se añadirá CHECK completed ⇒ storage_path NOT NULL. En M1.1 'completed'
-- significa "payload hasheado y hechos persistidos", NO "payload recuperable".

-- C.4 Filings
CREATE TABLE public.sec_filings (
  cik               text NOT NULL REFERENCES public.sec_companies(cik) ON DELETE RESTRICT,
  accession_number  text NOT NULL CHECK (accession_number ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
  form              text NOT NULL,
  filed_date        date NOT NULL,
  accepted_at       timestamptz,
  report_date       date,
  available_on      date NOT NULL,  -- = filed_date si accepted_at desconocido; regla en D.5
  first_run_id      uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cik, accession_number),
  FOREIGN KEY (cik, first_run_id) REFERENCES public.sec_ingestion_runs(cik, run_id) ON DELETE RESTRICT,
  CHECK (available_on >= filed_date)
);

-- C.5 Raw facts (identidad lógica, append-only)
CREATE TABLE public.sec_raw_facts (
  fact_hash          bytea PRIMARY KEY CHECK (octet_length(fact_hash) = 32),
  fact_hash_version  smallint NOT NULL DEFAULT 1 CHECK (fact_hash_version = 1),
  cik                text NOT NULL,
  accession_number   text NOT NULL,
  taxonomy_ns        text NOT NULL,   -- URI completa, p. ej. http://fasb.org/us-gaap/2024
  taxonomy_prefix    text NOT NULL,   -- 'us-gaap','dei',… (presentación)
  tag                text NOT NULL,
  unit               text NOT NULL,
  period_type        text NOT NULL CHECK (period_type IN ('instant','duration')),
  period_start       date,
  period_end         date NOT NULL,
  value_kind         text NOT NULL CHECK (value_kind IN ('numeric','text','nil')),
  value_numeric      numeric,          -- sin precisión fija: exacto
  value_text         text,
  dimensions         jsonb,            -- NULL = ausente; '[]' = vacío explícito
  fiscal_year        integer,          -- metadata SEC original, nullable
  fiscal_period      text,             -- nullable, sin CHECK de M1.2
  first_run_id       uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cik, fact_hash),
  FOREIGN KEY (cik, accession_number) REFERENCES public.sec_filings(cik, accession_number) ON DELETE RESTRICT,
  FOREIGN KEY (cik, first_run_id) REFERENCES public.sec_ingestion_runs(cik, run_id) ON DELETE RESTRICT,
  CHECK ((period_type = 'instant'  AND period_start IS NULL) OR
         (period_type = 'duration' AND period_start IS NOT NULL AND period_start <= period_end)),
  CHECK ((value_kind = 'numeric' AND value_numeric IS NOT NULL AND value_text IS NULL) OR
         (value_kind = 'text'    AND value_text IS NOT NULL AND value_numeric IS NULL) OR
         (value_kind = 'nil'     AND value_text IS NULL AND value_numeric IS NULL)),
  CHECK (dimensions IS NULL OR jsonb_typeof(dimensions) = 'array')
);

-- C.6 Observaciones (cada vez que una corrida ve un hecho; append-only)
CREATE TABLE public.sec_raw_fact_observations (
  observation_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cik               text NOT NULL,
  raw_fact_hash     bytea NOT NULL,
  run_id            uuid NOT NULL,
  frame             text,
  decimals          text,      -- texto: admite 'INF'
  form              text,
  filed_date        date,
  raw_json          jsonb NOT NULL,      -- objeto exacto del payload
  raw_json_sha256   bytea NOT NULL CHECK (octet_length(raw_json_sha256) = 32),
  conflict          boolean NOT NULL DEFAULT false,
  conflict_detail   jsonb,
  observed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (run_id, raw_fact_hash, raw_json_sha256),
  FOREIGN KEY (cik, raw_fact_hash) REFERENCES public.sec_raw_facts(cik, fact_hash) ON DELETE RESTRICT,
  FOREIGN KEY (cik, run_id) REFERENCES public.sec_ingestion_runs(cik, run_id) ON DELETE RESTRICT,
  CHECK (conflict = (conflict_detail IS NOT NULL))
);

-- C.7 Normalized facts (versionados)
CREATE TABLE public.sec_normalized_facts (
  normalized_fact_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cik                  text NOT NULL REFERENCES public.sec_companies(cik) ON DELETE RESTRICT,
  accession_number     text NOT NULL,
  logical_key          text NOT NULL,      -- concepto canónico + periodo + unidad
  canonical_concept    text NOT NULL,
  unit                 text NOT NULL,
  period_type          text NOT NULL CHECK (period_type IN ('instant','duration')),
  period_start         date,
  period_end           date NOT NULL,
  value_numeric        numeric NOT NULL,
  sec_fiscal_year      integer,            -- metadata SEC original
  sec_fiscal_period    text,
  resolved_fiscal_year integer,            -- lo rellena M1.2; NULL en M1.1
  resolved_fiscal_period text,             -- idem
  normalizer_version   text NOT NULL,
  rule_version         text NOT NULL,
  is_current           boolean NOT NULL DEFAULT true,
  superseded_by        uuid REFERENCES public.sec_normalized_facts(normalized_fact_id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cik, normalized_fact_id),
  UNIQUE NULLS NOT DISTINCT (cik, logical_key, accession_number, normalizer_version, rule_version),
  FOREIGN KEY (cik, accession_number) REFERENCES public.sec_filings(cik, accession_number) ON DELETE RESTRICT,
  CHECK ((period_type = 'instant'  AND period_start IS NULL) OR
         (period_type = 'duration' AND period_start IS NOT NULL AND period_start <= period_end)),
  CHECK (NOT is_current OR superseded_by IS NULL)
);
CREATE UNIQUE INDEX sec_norm_current_uq ON public.sec_normalized_facts(cik, logical_key, accession_number) WHERE is_current;

-- C.8 Linaje normalizado ↔ raw (misma empresa forzada por FK compuesta)
CREATE TABLE public.sec_normalized_fact_sources (
  cik                 text NOT NULL,
  normalized_fact_id  uuid NOT NULL,
  raw_fact_hash       bytea NOT NULL,
  role                text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary','component','fallback')),
  PRIMARY KEY (cik, normalized_fact_id, raw_fact_hash),
  FOREIGN KEY (cik, normalized_fact_id) REFERENCES public.sec_normalized_facts(cik, normalized_fact_id) ON DELETE RESTRICT,
  FOREIGN KEY (cik, raw_fact_hash) REFERENCES public.sec_raw_facts(cik, fact_hash) ON DELETE RESTRICT
);

-- Índices de consulta
CREATE INDEX sec_raw_facts_lookup ON public.sec_raw_facts(cik, tag, period_end);
CREATE INDEX sec_obs_run ON public.sec_raw_fact_observations(run_id);
CREATE INDEX sec_norm_lookup ON public.sec_normalized_facts(cik, canonical_concept, period_end) WHERE is_current;

-- C.9 Triggers
CREATE TRIGGER sec_companies_updated_at BEFORE UPDATE ON public.sec_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.sec_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'append-only table %: % forbidden', TG_TABLE_NAME, TG_OP
  USING ERRCODE = '42501'; END $$;
CREATE TRIGGER sec_raw_facts_append_only BEFORE UPDATE OR DELETE ON public.sec_raw_facts
  FOR EACH ROW EXECUTE FUNCTION public.sec_forbid_mutation();
CREATE TRIGGER sec_raw_facts_no_truncate BEFORE TRUNCATE ON public.sec_raw_facts
  FOR EACH STATEMENT EXECUTE FUNCTION public.sec_forbid_mutation();
CREATE TRIGGER sec_obs_append_only BEFORE UPDATE OR DELETE ON public.sec_raw_fact_observations
  FOR EACH ROW EXECUTE FUNCTION public.sec_forbid_mutation();
CREATE TRIGGER sec_obs_no_truncate BEFORE TRUNCATE ON public.sec_raw_fact_observations
  FOR EACH STATEMENT EXECUTE FUNCTION public.sec_forbid_mutation();
CREATE TRIGGER sec_sources_append_only BEFORE UPDATE OR DELETE ON public.sec_normalized_fact_sources
  FOR EACH ROW EXECUTE FUNCTION public.sec_forbid_mutation();

-- Normalized: solo UPDATE permitido es retirar (is_current true→false + superseded_by); resto prohibido
CREATE FUNCTION public.sec_normalized_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'normalized facts are never deleted' USING ERRCODE='42501'; END IF;
  IF (to_jsonb(NEW) - 'is_current' - 'superseded_by') <> (to_jsonb(OLD) - 'is_current' - 'superseded_by')
     OR NOT (OLD.is_current AND NOT NEW.is_current AND NEW.superseded_by IS NOT NULL) THEN
    RAISE EXCEPTION 'only supersession allowed' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sec_normalized_guard BEFORE UPDATE OR DELETE ON public.sec_normalized_facts
  FOR EACH ROW EXECUTE FUNCTION public.sec_normalized_guard();

-- Runs: solo transición running→completed|failed una vez, identidad inmutable
CREATE FUNCTION public.sec_runs_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'runs are never deleted' USING ERRCODE='42501'; END IF;
  IF OLD.status <> 'running' THEN RAISE EXCEPTION 'run already finalised' USING ERRCODE='42501'; END IF;
  IF (NEW.run_id, NEW.cik, NEW.resource_kind, NEW.endpoint_url, NEW.started_at, NEW.user_agent)
     IS DISTINCT FROM (OLD.run_id, OLD.cik, OLD.resource_kind, OLD.endpoint_url, OLD.started_at, OLD.user_agent)
  THEN RAISE EXCEPTION 'run identity immutable' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sec_runs_guard BEFORE UPDATE OR DELETE ON public.sec_ingestion_runs
  FOR EACH ROW EXECUTE FUNCTION public.sec_runs_guard();
-- sec_filings: BEFORE UPDATE OR DELETE → sec_forbid_mutation (los filings son hechos SEC inmutables)
CREATE TRIGGER sec_filings_immutable BEFORE UPDATE OR DELETE ON public.sec_filings
  FOR EACH ROW EXECUTE FUNCTION public.sec_forbid_mutation();

REVOKE ALL ON FUNCTION public.sec_forbid_mutation(), public.sec_normalized_guard(),
  public.sec_runs_guard() FROM PUBLIC, anon, authenticated;

-- C.10 GRANT (capa 1) — revocar primero por los default privileges detectados en A.1
REVOKE ALL ON public.sec_companies, public.sec_ticker_mappings, public.sec_ingestion_runs,
  public.sec_filings, public.sec_raw_facts, public.sec_raw_fact_observations,
  public.sec_normalized_facts, public.sec_normalized_fact_sources FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON public.sec_companies, public.sec_ticker_mappings, public.sec_filings,
  public.sec_normalized_facts TO anon, authenticated;
GRANT SELECT ON public.sec_ingestion_runs, public.sec_raw_facts, public.sec_raw_fact_observations,
  public.sec_normalized_fact_sources TO authenticated;   -- filtrado a admin por RLS

-- service_role (solo backend): mínimo por tabla
GRANT SELECT, INSERT, UPDATE ON public.sec_companies, public.sec_ticker_mappings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.sec_ingestion_runs TO service_role;
GRANT SELECT, INSERT ON public.sec_filings, public.sec_raw_facts,
  public.sec_raw_fact_observations, public.sec_normalized_fact_sources TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.sec_normalized_facts TO service_role;
-- Ningún DELETE/TRUNCATE a nadie.

-- C.11 RLS (capa 2)
ALTER TABLE public.sec_companies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_ticker_mappings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_ingestion_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_filings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_raw_facts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_raw_fact_observations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_normalized_facts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_normalized_fact_sources ENABLE ROW LEVEL SECURITY;

-- Públicas condicionadas a is_published; admin ve todo
CREATE POLICY sec_companies_read ON public.sec_companies FOR SELECT TO anon, authenticated
  USING (is_published OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY sec_tickers_read ON public.sec_ticker_mappings FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.sec_companies c WHERE c.cik = sec_ticker_mappings.cik AND c.is_published)
         OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY sec_filings_read ON public.sec_filings FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.sec_companies c WHERE c.cik = sec_filings.cik AND c.is_published)
         OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY sec_norm_read ON public.sec_normalized_facts FOR SELECT TO anon, authenticated
  USING ((is_current AND EXISTS (SELECT 1 FROM public.sec_companies c WHERE c.cik = sec_normalized_facts.cik AND c.is_published))
         OR public.has_role(auth.uid(), 'admin'));
-- Privadas: solo admin lee
CREATE POLICY sec_runs_admin_read    ON public.sec_ingestion_runs          FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY sec_raw_admin_read     ON public.sec_raw_facts               FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY sec_obs_admin_read     ON public.sec_raw_fact_observations   FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY sec_sources_admin_read ON public.sec_normalized_fact_sources FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
-- Sin políticas INSERT/UPDATE/DELETE: anon/authenticated no pueden escribir aunque se añadiera un GRANT por error.
-- service_role tiene BYPASSRLS; sus límites son los GRANT de C.10 y los triggers de C.9.
```

Nota de seguridad: la migración previa revocó `EXECUTE` de `has_role` a anon/authenticated. Las políticas la llaman en contexto del rol que consulta → **se debe re-conceder `GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated`** o las políticas fallarán. Esto debe confirmarse en preflight (F.1, consulta `has_function_privilege`); estado actual **no verificado** (psql no puede leer privilegios de función con este rol de forma fiable).

### C.12 Contrato de ingesta (Edge Function `sec-ingest`, M1.1 solo contrato)
1. Verifica JWT y `has_role(uid,'admin')`; si falla → 403, sin corrida.
2. Inserta run `status='running'` (un recurso = una corrida).
3. Descarga; calcula `payload_sha256` sobre los **bytes exactos del cuerpo HTTP** (`ArrayBuffer`), antes de `JSON.parse`. Nunca sobre JSON reserializado.
4. Si no 200 → `failed` con `http_status` y `error_message`; hash puede ser NULL.
5. Por cada hecho: calcula `fact_hash` (D); `INSERT ... ON CONFLICT (fact_hash) DO NOTHING RETURNING`; si no devolvió fila, `SELECT` la fila existente y compara **todos** los campos de identidad + metadatos originales (`fiscal_year`, `fiscal_period`, `taxonomy_prefix`, `accession_number`). Diferencia → observación con `conflict=true` y detalle, `conflicts++`. Inserta siempre una observación (deduplicada por `UNIQUE NULLS NOT DISTINCT`).
6. Todo en una transacción por corrida (RPC SQL `security definer` solo ejecutable por service_role, o lotes con verificación final de conteos).
7. Solo tras persistir hechos/observaciones: `completed` (CHECK exige hash, 200 y `conflicts=0`); con conflictos → `failed` con `error_message='fact conflicts: N'`.

---

## D. Fact hash v1

### D.1 Especificación
`fact_hash = SHA-256( DOMAIN || F(cik) || F(accn) || F(taxonomy_ns) || F(tag) || F(unit) || F(period_type) || D(period_start) || D(period_end) || K(value_kind) || V(value) || M(dimensions) )`

- `DOMAIN` = bytes ASCII `navaroli.sec.fact_hash.v1` + `0x00`. Cambiar cualquier regla ⇒ v2 y nueva columna de versión.
- Cada campo es TLV: 1 byte de tipo + longitud `uint32` big-endian + bytes. Sin separadores textuales.
- Tipos: `0x00` NULL (longitud 0) · `0x01` string · `0x02` fecha · `0x03` decimal · `0x04` enumeración/booleano · `0x05` lista.
- String: Unicode NFC → UTF-8. Sin trim ni cambio de mayúsculas (salvo campos con normalización propia abajo).
- Normalización por campo: `cik` 10 dígitos con ceros; `accn` `NNNNNNNNNN-NN-NNNNNN`; `taxonomy_ns` URI completa tal cual; `tag` local name exacto (case-sensitive); `unit` exacto de SEC (`USD`, `USD/shares`, `shares`); `period_type` `instant|duration`.
- Fecha: ISO `YYYY-MM-DD`. Instant ⇒ `period_start` = NULL (tipo 0x00).
- `value_kind`: `0x04` con `N` (numérico), `T` (texto), `X` (nil, valor NULL).
- Decimal exacto, nunca float: se parsea la **lexema** del JSON (requiere parser que preserve el texto del número, p. ej. `json.loads(parse_float=Decimal, parse_int=Decimal)` en Python y un parser lossless en TS). Forma canónica: sin exponente, sin `+`, sin ceros a la izquierda, sin ceros finales tras el punto, sin punto si es entero, `-0` → `0`, `NaN/Inf` rechazados. Ej.: `1.0`→`1`, `1.25E3`→`1250`, `-0.000`→`0`, `0.50`→`0.5`.
- Booleanos (no aparecen en companyfacts): `0x04` con `1`/`0`.
- Dimensiones: NULL (ausente) = `0x00`; lista vacía `[]` = `0x05` con count 0 (distinto de ausente). Cada miembro: `F(dim_ns) F(dim_local) 0x04('E'|'T')` + explícito `F(member_ns) F(member_local)` o tipado `F(typed_value_canonical)` (valor tipado en forma canónica XML exc-c14n; detalle en M1.3). Orden por bytes UTF-8 de `(dim_ns, dim_local)`; dimensión repetida ⇒ error. Recursión: valores tipados con estructura se canonicalizan antes, nunca se insertan como JSON crudo.
- Excluidos (B5/B6): `frame`, `decimals`, `fy`, `fp`, `form`, `filed`.

### D.2 Vectores (todos sobre la base AAPL Revenues FY2024, `taxonomy_ns=http://fasb.org/us-gaap/2024`, `unit=USD`, duration 2023-10-01..2024-09-28)
| ID | Variación | Expectativa |
|---|---|---|
| V1 | valor `1` | hash H1 |
| V2 | valor `1.0` | = H1 |
| V3 | valor `-0` | = V4 |
| V4 | valor `0.000` | igual a V3, distinto de H1 |
| V5 | texto literal `"NONE"` | ≠ V6 |
| V6 | nil (valor NULL) | ≠ V5 |
| V7 | texto `"Café"` NFC | = V8 |
| V8 | texto `"Cafe\u0301"` NFD | = V7 |
| V9 | dimensiones ausentes | ≠ V10 |
| V10 | dimensiones `[]` | ≠ V9 |
| V11 | dimensión tipada `dei:LegalEntityAxis = <x>A</x>` | ≠ V12, ≠ V9 |
| V12 | dimensión explícita `us-gaap:StatementBusinessSegmentsAxis = aapl:AmericasSegmentMember` | ≠ V11 |
| V13 | `1.25E3` | = V14 |
| V14 | `1250.00` | = V13 |
| V15 | instant (start NULL) | ≠ H1 |

**Hashes hexadecimales: NOT RUN.** El modo plan bloqueó escribir los scripts. No se publican hashes ni se consideran verificados. Solo las relaciones de igualdad/desigualdad son requisitos.

### D.3 Scripts de referencia (para crear en Build en `validation/fnd001/`)
- `fact_hash.py`: Python 3, `hashlib`, `unicodedata`, `decimal.Decimal`, `struct.pack(">I")`. Implementación independiente.
- `factHash.ts`: TypeScript/Bun, `crypto.createHash`, `String.normalize("NFC")`, parser decimal propio con regex (sin `Number`).
- `vectors.json`: entradas V1–V15 + hashes esperados, que se generan con Python y deben coincidir byte a byte con TS.
- Comando: `python3 validation/fnd001/fact_hash.py > /tmp/py.txt && bun validation/fnd001/factHash.ts > /tmp/ts.txt && diff /tmp/py.txt /tmp/ts.txt` — **NOT RUN**.
- Ya existen borradores probados en sintaxis pero no ejecutados; se reescribirán en Build.

---

## E. Tests (todos NOT RUN)

Aislamiento: cada suite SQL dentro de `BEGIN; ... ROLLBACK;` con CIK sintéticos `9999999901`/`9999999902` y fechas ficticias; ningún dato productivo. Las suites RLS se ejecutan contra un usuario de prueba creado/destruido por el harness.

| # | Test | Tipo | Comando | Estado |
|---|---|---|---|---|
| T1 | FK cross-company: filing de CIK A con run de CIK B → 23503 | SQL | `psql -f validation/fnd001/sql/t1_fk_cross_company.sql` (como owner en rama/draft) | NOT RUN |
| T2 | Raw fact de A apuntando a filing de B → 23503 | SQL | idem t2 | NOT RUN |
| T3 | Normalized de A con filing de B; source (A, norm de A, raw de B) → 23503 | SQL | t3 | NOT RUN |
| T4 | CHECK numeric/text/nil (6 combinaciones inválidas → 23514) | SQL | t4 | NOT RUN |
| T5 | CHECK instant con start; duration sin start; start>end → 23514 | SQL | t5 | NOT RUN |
| T6 | Precisión: `123456789012345678901234.123456789` se lee igual | SQL | t6 | NOT RUN |
| T7 | `UNIQUE NULLS NOT DISTINCT` en normalized (versión repetida) → 23505 | SQL | t7 | NOT RUN |
| T8 | Dos runs UUID distintos, mismo hecho: 1 raw fact, 2 observaciones | SQL+TS | t8 + `bunx vitest run validation/fnd001/ingest.test.ts` | NOT RUN |
| T9 | Mismo `fact_hash`, `fiscal_period` distinto → observación `conflict=true`, run `failed` | TS | ingest.test.ts | NOT RUN |
| T10 | UPDATE/DELETE/TRUNCATE en raw/observations → 42501, incluido como service_role y como admin | SQL | t10 | NOT RUN |
| T11 | Normalized: UPDATE de valor rechazado; supersession aceptada; DELETE rechazado | SQL | t11 | NOT RUN |
| T12 | Run: `completed` sin hash → 23514; reabrir run finalizado → 42501 | SQL | t12 | NOT RUN |
| T13 | RLS anon: ve empresa publicada, no la no publicada; 0 filas en raw/obs/runs/sources; INSERT → 42501 | TS, JWT real | `bunx vitest run validation/fnd001/rls.test.ts` | NOT RUN |
| T14 | RLS authenticated no-admin: igual que anon | TS | rls.test.ts | NOT RUN |
| T15 | RLS admin: lee todo; INSERT/UPDATE → 42501 | TS | rls.test.ts | NOT RUN |
| T16 | service_role: INSERT OK; DELETE → 42501 (sin GRANT) | TS (solo servidor/CI con secreto) | rls.test.ts | NOT RUN |
| T17 | Vectores de hash Python = TS | Script | ver D.3 | NOT RUN |
| T18 | `payload_sha256` de fixture binario = `sha256sum` del archivo | TS | `bunx vitest run validation/fnd001/payload.test.ts` | NOT RUN |

---

## F. Preflight y trazabilidad

### F.1 Preflight read-only (a ejecutar justo antes de la migración)
```sql
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='app_role' ORDER BY enumsortorder;
SELECT pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid), provolatile, prosecdef, proconfig
  FROM pg_proc p WHERE p.oid = 'public.has_role(uuid,public.app_role)'::regprocedure;
SELECT has_function_privilege('anon','public.has_role(uuid,public.app_role)','EXECUTE'),
       has_function_privilege('authenticated','public.has_role(uuid,public.app_role)','EXECUTE');
SELECT extname, extversion FROM pg_extension WHERE extname IN ('pgcrypto');
SELECT relname, relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND relname LIKE 'sec\_%';
SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'sec\_%';
SELECT defaclrole::regrole, defaclobjtype, defaclacl FROM pg_default_acl;
SELECT current_setting('server_version_num')::int >= 150000 AS nulls_not_distinct_ok;
```
Si existe algún `sec_*`: comparar columnas (`information_schema.columns`), constraints (`pg_constraint`) y políticas con C; si coinciden, la migración se vuelve no-op; si difieren, informe de diferencias y decisión del usuario, sin abortar a ciegas.

Resultado de hoy: ver A.1. **Pendientes:** privilegio EXECUTE de `has_role`; versión del servidor ≥15 (`NULLS NOT DISTINCT`). La consulta de versión no devolvió salida legible; **no verificado**.

### F.2 Matriz requisito → objeto → test
| Requisito | Objeto | Test |
|---|---|---|
| 1 Coherencia | C.1–C.8 (DDL único) | T1–T7 |
| 2 Mínimo privilegio | C.10 REVOKE/GRANT, C.11 políticas | T13–T16 |
| 2 Publicación por empresa | políticas filings/norm/tickers | T13 |
| 3 Append-only | `sec_forbid_mutation`, sin GRANT UPDATE/DELETE | T10 |
| 3 Conflictos | `conflict`, `conflicts`, CHECK completed | T9, T12 |
| 3 Versionado normalized | `normalizer_version`, `rule_version`, `sec_normalized_guard` | T7, T11 |
| 3 Historia no destruible | FK `ON DELETE RESTRICT` | T10 |
| 4 Ingesta/payload | `sec_ingestion_runs`, C.12 | T12, T18 |
| 5 Fact hash | D.1 | T17 |
| 6 Periodos fiscales | columnas nullable, `resolved_*` | T5 |
| 7 Tests | E | — |
| 8 Preflight | F.1 | — |

---

## G. Riesgos residuales
1. **Recuperación del payload no garantizada en M1.1** (B8). Una corrida `completed` no permite re-descargar los bytes exactos.
2. **Re-grant EXECUTE de `has_role`** contradice parcialmente el fix de seguridad previo. Alternativa: envolver en `sec_is_admin()` SQL `security definer` concedida a anon/authenticated. Requiere decisión.
3. Atomicidad: PostgREST no ofrece transacciones multi-statement; se necesita una función RPC o aceptar corridas `failed` parciales (las filas parciales quedan, porque son append-only). Requiere decisión en M1.2.
4. Dimensiones y valores tipados: diseñados pero no ejercitados por companyfacts; la canonicalización XML se cierra en M1.3.
5. Parser JSON lossless en Deno: si se usa `JSON.parse`, los decimales con más de 15–17 dígitos pierden exactitud. Necesita parser lossless (riesgo de dependencia).
6. Hashes de vectores sin calcular; los 18 tests sin ejecutar.
7. `available_on`: regla provisional (`filed_date`, o el día siguiente si `accepted_at` es posterior a las 17:30 ET); se valida en M1.2.

M1.1 remains NOT APPROVED; no implementation performed.
