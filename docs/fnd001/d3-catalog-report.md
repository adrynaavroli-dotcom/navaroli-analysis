# FND-001 / M1.1 — D3: comparación de catálogo (solo lectura) y evidencia oficial de CI

Fecha: 2026-11-10 (UTC). Estado: **FND-001 IN PROGRESS, M1.1 sin cerrar**. D4 **no ejecutado**.

## 1. Alcance autorizado y cómo se respetó

- Solo `SELECT` sobre catálogos del sistema (`pg_class`, `pg_attribute`, `pg_constraint`, `pg_policies`, `pg_proc`, `pg_roles`, `pg_auth_members`, `pg_default_acl`, `pg_db_role_setting`) y funciones de privilegio integradas (`has_table_privilege`, `has_function_privilege`, `has_schema_privilege`, `pg_has_role`).
- Ninguna fila de negocio, usuarios ni datos financieros. Sin DDL, DML, GRANT/REVOKE ni cambios de configuración.
- Ejecución: `validation/fnd001/run-d3-catalog.sh`. Fuerza `default_transaction_read_only = on` y aborta si el servidor no lo confirma (marcador `READONLY=on` comprobado antes de guardar la salida).
- Sesión usada: `current_user = session_user = sandbox_exec`, PostgreSQL **17.6** (producción). El stack de CI usa **17.11**: diferencia de versión menor, documentada y no estructural.
- El identificador del proyecto se ha sustituido por `<project-ref>` en la evidencia guardada.

## 2. Evidencia guardada (`docs/fnd001/evidence/d3/`)

| Archivo | Origen | SHA-256 |
|---|---|---|
| `ci-catalog-fingerprint.txt` | Artefacto `fnd001-m11-evidence` del run 42360647941. Se quitó solo la línea informativa de psql `Output format is unaligned.` | `a3a94a80…1b309` |
| `prod-catalog-fingerprint.txt` | Producción, sesión de solo lectura | `a3a94a80…1b309` |
| `fingerprint.diff` | `diff` de los dos anteriores | vacío (`e3b0c442…b855`) |
| `prod-platform-roles.txt` | Producción, `sql/d3-platform-roles.sql`, 11 secciones | `489bd2ce…7b65` |
| `SHA256SUMS.txt` | Hashes completos, incluido el zip del artefacto (`df540c80…dfb7e`, igual al digest que publicó GitHub) | — |

## 3. Resultado del diff, por categorías

### 3.1 Diferencias estructurales del esquema `public`: **ninguna**
906 líneas en cada lado (238 columnas, 17 relaciones, 108 constraints, 41 índices, 40 políticas, 27 triggers, 12 funciones, 1 vista, 5 enums, 375 ACL de tablas y 22 de funciones). Los dos ficheros son **byte a byte idénticos**.

Esto incluye propietarios, RLS/FORCE, `SECURITY DEFINER`, `search_path`, hash del cuerpo de cada función y las ACL de `anon`, `authenticated`, `service_role`, `postgres` y `authenticator`. La base reconstruida desde la cadena única coincide con producción.

### 3.2 Privilegios de plataforma (excluidos de la huella a propósito)
La huella filtra `sandbox_exec*`, `supabase_admin`, `supabase_read_only_user` y `dashboard_user`. Sobre esos roles, solo producción tiene datos. Lo observado en producción:

| Hallazgo | Detalle |
|---|---|
| Dos roles | `sandbox_exec` y `sandbox_exec_<project-ref>`: LOGIN, **BYPASSRLS**, no superusuario, no CREATEROLE/CREATEDB |
| Pertenencias | Ninguna saliente: no pueden actuar como ningún otro rol (grafo transitivo vacío). `postgres` es miembro administrador de ambos (ADMIN, sin INHERIT ni SET) |
| Origen de los grants | `pg_default_acl` de `postgres` en `public`: tablas → `SELECT, INSERT`; secuencias → `SELECT, USAGE`; funciones → `EXECUTE` **solo** para `sandbox_exec_<project-ref>`. **CONFIRMADO** (antes NOT VERIFIED) |
| Tablas `sec_*` | Ambos roles: `SELECT, INSERT` efectivos en las 8 tablas; sin UPDATE, DELETE, TRUNCATE, TRIGGER ni REFERENCES |
| Funciones `sec_*` | `sandbox_exec_<project-ref>`: EXECUTE en las 4 RPC de corrida (`sec_record_download`, `sec_fail_run`, `sec_fail_stale_runs`, `sec_finalize_run`), los 4 triggers, `sec_is_admin` y `has_role`. `sandbox_exec`: ninguna |
| Esquemas | Ambos: USAGE en `public`, sin CREATE; sin USAGE en `auth` |

### 3.3 Relación con los roles de PostgREST: **ninguna**
- `authenticator`, `anon`, `authenticated` y `service_role` no son miembros de ningún `sandbox_exec*`: `pg_has_role` MEMBER/USAGE = false en los 8 pares.
- `sandbox_exec*` tampoco son miembros de ningún rol de la API.
- La API REST no puede adquirir estos privilegios; solo se usan con credenciales de conexión directa que existen en el entorno de desarrollo.
- Ajustes de rol en producción: `anon` con `statement_timeout=3s`, `authenticated` con 8s, `authenticator` con `safeupdate` y 8s/8s. Sin ajustes para `sandbox_exec*`.

### 3.4 Posibles discrepancias reales respecto a la especificación
1. **Escritura fuera de la vía aprobada.** La regla dice que `sec_*` solo se escriben por la función de ingesta y las RPC. La migración revoca primero los default privileges, pero solo para `PUBLIC, anon, authenticated, service_role`. Por eso los dos roles de plataforma conservan **INSERT con BYPASSRLS** en `sec_*`, y `sandbox_exec_<project-ref>` puede ejecutar las RPC de corrida.
   - Mitigación vigente: los triggers siguen aplicando las invariantes (sin UPDATE/DELETE, corridas creadas vacías y en `running`, linaje desde la corrida de origen).
   - Riesgo residual: con estos roles se podría crear una fila `sec_companies` con `is_published = true` que la web pública mostraría. **No se ha probado** porque D3 no autoriza DML.
2. **Huella con un punto ciego.** La huella no cubre `pg_default_acl`, ACL de esquemas, roles ni esquemas distintos de `public`. Las secciones 5, 10 y 11 de `d3-platform-roles.sql` cubren esa parte solo en producción. El equivalente en CI está **NOT VERIFIED**: no se ha capturado y probablemente no existen roles `sandbox_exec*` en el stack local.
3. **Qué herramienta usa `sandbox_exec_<project-ref>`:** NOT VERIFIED. El `psql` del agente usa `sandbox_exec`.

## 4. CI oficial: run 42360647941

- Workflow `Quality checks`, run **42360647941**, SHA **`3d7d106942de4e5e0a212eb9b3d2a75258d7c8ed`**, `completed / success`.
- URL: https://github.com/adrynaavroli-dotcom/navaroli-analysis/actions/runs/42360647941.
- Job `fnd001-db` (ID 128368120607): success, 09:39:27–09:41:15 UTC del 2026-11-07.
- Artefacto `fnd001-m11-evidence` (ID 13569900346): 12 668 bytes, digest `sha256:df540c80…dfb7e`, verificado tras descargarlo. Contiene 3 ficheros: huella de 907 líneas (incluida la informativa), `db-tests.txt` y `access-check.txt`.

| Paso | Resultado |
|---|---|
| Migration chain guards | success. 6/6 ok: legacy sin cambios, sin archivos nuevos, sin `sec_*` en la cadena antigua, `schema.ts` vacío, journal = SQL, sin drizzle-kit generate/pull/push |
| Inicio del stack Supabase | success. Supabase CLI **3.0.0**, `major_version = 17`, `server_version = 17.11` |
| Reconstrucción de migraciones | success. 16 migraciones antiguas + `0000_fnd001_m11_sec_schema.sql` |
| Catalog fingerprint | success. 907 líneas (906 + la informativa) |
| T1–T33, parte M1.1 | success. **186/186**; rollback con 0 filas `sec_*`. T19, T22, T32 y las partes de parser/payload, diferidos a M1.2 |
| T20/T21 con JWT reales | success. **29/29**: `sec_is_admin` anon/no-admin/admin = false/false/true; anon sin EXECUTE en `has_role` (42501); matriz RLS/grants de anon, no-admin, admin y service_role; T25 `service_role` UPDATE de corrida denegado |

El job `quality` del mismo run también pasó: TypeScript, Vitest, VOL-003/004/005, POR-001, vectores hash FND-001 y build. Entre `3d7d106` y el árbol actual solo cambian archivos de este turno y uno autogenerado de la plataforma; el código probado es el mismo.

## 5. Reproducibilidad

| Herramienta | Versión observada en el run 42360647941 | Cómo está ahora |
|---|---|---|
| Supabase CLI | 3.0.0 | `version: latest` |
| Imágenes del stack (las fija la CLI) | postgres 17.11.0.011, gotrue v2.197.0, postgrest v16.5, kong 2.8.1, mailpit v1.31.3 | Dependen de la CLI |
| `supabase/setup-cli` | @v1 → `1dedf2c611547ede7232d26866dd3c56ab903bbb` | Etiqueta móvil |
| Bun | 1.4.4 | `bun-version: latest` |
| Runner | ubuntu-24.04, imagen 20261101.360.1 | `ubuntu-latest` |

**Aplicado el 2026-11-11, con autorización del usuario:**
- en los dos jobs, runner `ubuntu-24.04` y `bun-version: 1.4.4`. Los registros del run 42360647941 confirman Bun 1.4.4 y la imagen ubuntu-24.04 20261101.360.1 en ambos jobs;
- en `fnd001-db`, `supabase/setup-cli@1dedf2c611547ede7232d26866dd3c56ab903bbb` (la etiqueta v1 que resolvió el run; el commit existe en `supabase/setup-cli`) con `version: 3.0.0`;
- `actions/checkout@v4`, `oven-sh/setup-bun@v2` y `actions/upload-artifact@v4` siguen con etiqueta móvil: no estaban en la autorización;
- las versiones solo se actualizarán de forma deliberada, con un run nuevo anotado aquí.

Desde este turno, el job guarda `supabase --version` en `fnd001-evidence/toolchain.txt`.

**Revisión de los wrappers (corregido en este turno):**
- `access-check.ts` validaba la URL de base de datos con una regex propia **sin anclar**. Aceptaba, por ejemplo, `postgresql://u@db.<project-ref>.supabase.co:5432/postgres?x=@localhost:1/`; esto se reprodujo.
  - Ahora delega en `lib/guard.sh`, la misma regla que los scripts shell. La URL REST también aplica la lista de exclusión.
  - Las 3 URLs de ataque y la URL REST de producción se rechazan con salida 2.
- El workflow llamaba a `psql` directamente en dos pasos (NOTIFY y huella).
  - Ahora `NOTIFY` está dentro de `apply-chain.sh` y la huella va por `catalog-fingerprint.sh`, ambos protegidos.
  - `check-migration-chain.sh` comprueba (punto 6) que el workflow no invoque `psql`.
- Verificación local en base desechable (PostgreSQL 17.11 + shim, no oficial):
  - la cadena se reconstruyó;
  - `catalog-fingerprint.sh` produjo 906 líneas idénticas a las de CI y producción;
  - `run-db-tests.sh` dio 186/186;
  - las guardas dieron 7/7.
  - Un `psql` directo fuera del wrapper falló por el `PGSSLMODE` heredado del entorno; el wrapper lo elimina.

## 6. Propuesta D4 (SUSTITUIDA el 2026-11-11 por `docs/fnd001/d4-proposal.md`; se conserva como histórico)

**Objetivo:** cumplir la regla «escrituras en `sec_*` solo por la ingesta y las RPC» también frente a los roles de plataforma, sin tocar privilegios globales del proyecto.

**Cambio propuesto:** una migración Drizzle a medida que revoque solo sobre objetos `sec_*`.
```sql
-- Sin efecto si los roles no existen (stack de CI): se comprueban en pg_roles.
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['sandbox_exec', 'sandbox_exec_<project-ref>'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE INSERT ON public.sec_companies, public.sec_ticker_mappings, public.sec_ingestion_runs,
        public.sec_filings, public.sec_raw_facts, public.sec_raw_fact_observations, public.sec_normalized_facts,
        public.sec_normalized_fact_sources FROM %I', r);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.sec_record_download(uuid,integer,text,bigint,bytea),
        public.sec_fail_run(uuid,text,jsonb), public.sec_fail_stale_runs(interval), public.sec_finalize_run(uuid,jsonb,jsonb),
        public.sec_guard(), public.sec_insert_guard(), public.sec_norm_lineage_check(), public.sec_supersession_check() FROM %I', r);
    END IF;
  END LOOP; END $$;
```
**Se mantiene:**
- `SELECT` de esos roles, porque es necesario para la inspección y depuración de solo lectura;
- `EXECUTE` en `sec_is_admin()` y `has_role()`;
- los default privileges del proyecto.

**Impacto:**
- La app, la API REST y `service_role` no cambian: no son miembros de esos roles (§3.3).
- El agente de desarrollo ya no podrá insertar en `sec_*` ni ejecutar las RPC por conexión directa. Es el efecto buscado.
- Las migraciones no se ven afectadas, porque se aplican con un rol privilegiado distinto.

**Riesgos:**
1. La plataforma podría volver a conceder o restablecer estos grants. No sabemos si lo hace: NOT VERIFIED. Mitigación: repetir `run-d3-catalog.sh` tras cada migración y comprobar las secciones 6–9.
2. Los objetos `sec_*` nuevos de M1.2 heredarán otra vez los default privileges. Cada migración SEC futura tendrá que incluir el mismo bloque o un helper equivalente.
3. Si alguna herramienta de Lovable usa `sandbox_exec_<project-ref>` para escribir en `sec_*`, dejará de poder hacerlo. No hay uso conocido: NOT VERIFIED.
4. El bloque nombra el project-ref. En CI no hace nada porque los roles no existen, así que esa rama solo se prueba en producción, con una huella posterior de solo lectura.
5. Si un día la plataforma cambiara el nombre de los roles, el bloque no haría nada en silencio. Mitigación: el postflight D3 debe confirmar `ins = false` en la sección 8.

**Alternativa:** no revocar y aceptar el riesgo como riesgo de plataforma, documentado. Las invariantes de los triggers siguen activas, pero queda abierta la inserción de filas `sec_companies` publicadas fuera de la vía aprobada.
