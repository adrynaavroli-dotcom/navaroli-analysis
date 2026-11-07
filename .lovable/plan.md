# FND-001 / M1.1 — Diagnóstico previo a las pruebas T1–T33 y plan de actuación

Estado: FND-001 **IN PROGRESS**. En este turno no se ha ejecutado SQL, no se ha creado ninguna base y no se ha modificado la app. Diagnóstico basado en archivos del repositorio y variables de entorno (solo nombres, sin valores).

---

## 1. Entorno aislado

**Diagnóstico**
- **CONFIRMADO:** el proyecto usa **Lovable Cloud**, no un proyecto externo. Una sola instancia sirve a la vista previa y a la app publicada, así que **la vista previa NO es un entorno aislado**.
- **Draft de Lovable.** Según la documentación de la plataforma, un draft nuevo recibe su propia base de pruebas local: misma estructura y ningún dato. Si esa preparación falla, el draft usa la base real. El resultado de la creación indica cuál de los dos casos se aplica. Así que un draft *puede* aislar la base, pero:
  - **NOT VERIFIED:** cómo reconstruye la estructura (¿aplica las 16 migraciones antiguas además de la de Drizzle?);
  - **NOT VERIFIED:** si incluye `auth`, los roles anon/authenticated/service_role, la emisión de JWT y la API REST. T20 y T21 los necesitan;
  - no es reproducible en CI ni queda como evidencia permanente.
- **Supabase Branching:** no está disponible en Lovable Cloud, que no tiene panel de Supabase. Solo sería viable en un proyecto Supabase propio con plan Pro y la integración de GitHub (cómputo por horas por rama). Coste aproximado, NOT VERIFIED para 2026.
- **Proyecto Supabase separado (cuenta propia):** aislamiento real y persistente. Pero exige una cuenta y una cadena de conexión como secreto de GitHub, y el plan gratuito pausa por inactividad. No se puede conectar a esta app (Cloud no es intercambiable); solo serviría para CI o scripts.
- **Stack local de Supabase en GitHub Actions** (CLI `supabase start` en Docker, efímero): Postgres de Supabase con `auth.uid()`, los roles estándar, GoTrue (JWT reales) y la API REST. Coste 0 en repositorio público; en privado consume minutos de Actions (NOT VERIFIED: visibilidad del repo). Limitaciones:
  - no reproduce cambios hechos a mano en producción, que cubre la comprobación de deriva del punto 2;
  - la versión mayor de Postgres debe fijarse en 17 con un config propio del CI, sin tocar `supabase/config.toml`, que se autogenera.

**Recomendación (D1):** stack local efímero en GitHub Actions como entorno oficial de T1–T33. Es aislado por construcción, reproducible en cada commit y su evidencia es la URL del run. El draft queda como alternativa manual.

---

## 2. Estrategia de migraciones

**Diagnóstico (CONFIRMADO en archivos)**
- `supabase/migrations/`: 16 archivos antiguos, registrados en `supabase_migrations.schema_migrations`. Contienen las 8 tablas no SEC, `user_roles`, `has_role` y la vista `public_thesis_data_view`. Ninguno contiene objetos `sec_*`.
- `drizzle/migrations/`: un archivo (`0000_fnd001_m11_sec_schema.sql`), registrado en `drizzle.__drizzle_migrations`. Contiene las 8 tablas `sec_*`. Depende de objetos antiguos (`app_role`, `has_role`, `user_roles`).
- `drizzle/schema.ts` vacío y snapshot sin tablas: **así está diseñado**. Las migraciones son SQL a medida y Drizzle Kit solo sirve como ejecutor y registro, sin derivar nada del esquema TS. El snapshot no es una fuente de verdad.

**Fuente de verdad única:** la cadena ordenada `supabase/migrations/*` (congelada, por nombre de archivo) seguida de `drizzle/migrations/*` (en el orden del registro). Reglas:
1. No se añaden archivos nuevos a `supabase/migrations/`; todo DDL nuevo va por el flujo Drizzle.
2. `drizzle/schema.ts` sigue vacío; nunca se ejecutan `drizzle-kit generate`/`pull`, que generarían CREATE duplicados.
3. La base de pruebas aplica la cadena con `psql -v ON_ERROR_STOP=1` en ese orden. Su historial es efímero y nunca se escribe en el historial de producción.
4. **Comprobación de deriva:** se compara una huella del catálogo `public` (columnas, constraints, índices, políticas, triggers, funciones con su firma y su propietario, ACL) entre la base de pruebas y producción. En producción solo se usan consultas de catálogo de lectura, que **requieren tu autorización (D3)**. Diferencias aceptadas: roles de plataforma (`sandbox_exec_*`) y datos.
5. Guardas de CI: falla si aparece un archivo nuevo en `supabase/migrations/` o un objeto `sec_*` en él, o si `drizzle/schema.ts` deja de estar vacío.

---

## 3. Preparación de T1–T33

**Diagnóstico:** en `validation/fnd001/` solo existe `hash-vectors.sh` (TH-F/TH-J). **No existen** `sql/t01_t31.sql`, `access.test.ts`, `ingest.test.ts` ni `payload.test.ts`. Además:
- el nombre `t01_t31.sql` es anterior a T32/T33;
- varias pruebas dependen de la función de ingesta `sec-ingest`, que pertenece a M1.2 y no existe. Por eso no pueden cerrarse en M1.1 sin simularla.

**Propuesta de archivos**
- `validation/fnd001/sql/db_tests.sql`: todo en `BEGIN … ROLLBACK`. Una `SAVEPOINT` por caso. Un helper temporal `expect_sqlstate(sql, estado)` que se descarta con el ROLLBACK. Salida `ok Tn.x` / `not ok Tn.x (SQLSTATE)`. CIK sintéticos `9999999901`/`02`.
- `validation/fnd001/access.test.ts`: usuarios admin y no-admin creados en el stack local, JWT reales contra la API REST.
- `validation/fnd001/payload.test.ts` e `ingest.test.ts`: se crean en **M1.2**, junto con `sec-ingest`.
- `validation/fnd001/run-db-tests.sh`: se niega a ejecutarse si el host apunta al proyecto de producción y exige 0 filas `sec_*` al terminar.

**Correspondencia** (M1.1 = cerrable ahora; M1.2 = requiere `sec-ingest`)

| T | Archivo | Datos | Esperado | Fase |
|---|---|---|---|---|
| T1–T3 | db_tests.sql | 2 CIK, corridas cruzadas | 23503 | M1.1 |
| T4–T7 | db_tests.sql | combinaciones de tipo, periodo, NaN, decimal largo | 23514 / igualdad | M1.1 |
| T8, T9 | db_tests.sql | mismo hecho, 1 y 2 corridas | 1/2 filas; 1 raw, 2 observaciones | M1.1 |
| T10 | db_tests.sql | observaciones `metadata` / `frame_only` | failed / completed | M1.1 |
| T11–T16 | db_tests.sql | DML prohibido, supersession, estado inicial de corrida | 42501 / 23503 / 23514 | M1.1 |
| T17 | db_tests.sql (fallo, INSERT tras failed) · ingest.test.ts (reintento) | lote parcial | failed, 23514 · sin duplicados | M1.1 + M1.2 |
| T18 | db_tests.sql | corridas failed, running y submissions | 23514 | M1.1 |
| T19 | payload.test.ts | clave fuera de la allowlist, accn desconocido | rechazo | M1.2 |
| T20 | db_tests.sql (claims simulados) + access.test.ts (JWT real) | anon, no-admin, admin, sin UID | f/f/t/f | M1.1 |
| T21 | access.test.ts + db_tests.sql (`SET ROLE`) | filas publicadas y privadas | según C.12/C.13 | M1.1 |
| T22 | ingest.test.ts | fixture binario, R01–R13, X01–X04 | igualdad | M1.2 |
| T23, T24 | db_tests.sql (contadores con filas sintéticas) · ingest.test.ts (payload real) | 3 filings / N hechos | completed, contadores | M1.1 + M1.2 |
| T25–T27 | db_tests.sql | RPC, kind cruzado, linaje, conflicto de filing | según caso | M1.1 |
| T28, T29 | db_tests.sql (CHECK) · payload.test.ts (exclusión y contadores) | `srt`, 8-K, 20-F | 23514 · skipped | M1.1 + M1.2 |
| T30, T31 | db_tests.sql | contadores NULL, existing derivados, 101 muestras | 23514 / failed | M1.1 |
| T32 | payload.test.ts | USD y EUR del mismo tag, dei texto/null | herencia del contexto padre | M1.2 |
| T33 | db_tests.sql (`filings_not_inserted`) · payload.test.ts (detección de repetidos) | 3 elegibles, 1 repetido | 2 insertados / 1 no insertado | M1.1 + M1.2 |

**D2 (cambio metodológico, requiere aprobación):** M1.1 se cierra con la parte de base de datos y acceso de cada test. La parte que depende del parser o de la ingesta pasa a ser criterio de aceptación de M1.2. Hasta que haya evidencia, ningún test se marca como ejecutado.

---

## 4. Seguridad: rol `sandbox_exec_*`

**CONFIRMADO:** el `psql` de mi entorno de desarrollo se conecta como `sandbox_exec_*` a través del pooler, con credenciales que solo existen en las variables del sandbox. Es el rol técnico de la plataforma para las consultas del agente; no forma parte de la app.

**Alcance:** la migración revoca permisos solo a PUBLIC, anon, authenticated y service_role. Por eso los permisos de `sandbox_exec_*` sobre `sec_*` probablemente vienen de los default privileges de la plataforma (hipótesis, NOT VERIFIED). BYPASSRLS ignora RLS, pero **no** los triggers: `sec_guard` sigue bloqueando UPDATE y DELETE. Con INSERT y EXECUTE de las RPC sí podría crear corridas o filas fuera del flujo de ingesta.

**¿Lo pueden usar los clientes?** No, en principio. La app llega a la base mediante la API REST, que solo cambia a anon, authenticated o service_role según el JWT. NOT VERIFIED: que `authenticator` no sea miembro de `sandbox_exec_*`, y la lista exacta de `pg_default_acl`.

**Propuesta (D4, sin ejecutar):**
- primero, consultas de catálogo de lectura (`rolbypassrls`, pertenencias, `pg_default_acl`, ACL de `sec_*`);
- después, decidir si se revocan solo INSERT/UPDATE/DELETE/TRUNCATE y EXECUTE de las RPC `sec_*` a `sandbox_exec_*`, manteniendo SELECT para el diagnóstico.

Impacto: el agente dejaría de poder escribir en `sec_*`, que es lo deseado. Riesgo: la plataforma podría volver a conceder esos permisos (NOT VERIFIED). BYPASSRLS es un atributo gestionado por la plataforma y no se toca.

---

## 5. Documentación as-built

- La especificación aprobada (`.lovable/plan/fnd-001-m1-1-especificación-canónica-consolidada-…`) no se modifica. Solo se le añade una línea de cabecera que apunta al registro.
- Nuevo `docs/fnd001/m1.1-as-built.md`:
  - migración aplicada y su SHA-256, con fecha;
  - resultados del preflight y del postflight (CONFIRMADO / NOT VERIFIED);
  - desviaciones respecto a la especificación: nombre del archivo SQL, reparto entre M1.1 y M1.2, permisos de `sandbox_exec_*`, snapshot vacío por diseño;
  - tabla T1–T33 con estado NOT RUN / PASS / FAIL, enlace al run y SHA;
  - pendientes abiertos.
- En la matriz, FND-001 sigue IN PROGRESS. En `AGENTS.md` se añade una regla sobre la cadena única de migraciones.

---

## Decisiones que necesito

- **D1:** entorno de pruebas → stack local efímero en GitHub Actions (recomendado), draft o proyecto Supabase propio.
- **D2:** reparto de los tests entre M1.1 y M1.2, como en la tabla.
- **D3:** autorizar consultas de catálogo de **solo lectura** en producción, para la deriva y para `sandbox_exec_*`.
- **D4:** revocar permisos de escritura a `sandbox_exec_*` sobre `sec_*`, después de D3.

## Criterios de aceptación

1. La base de pruebas se crea desde cero solo con la cadena del punto 2, y la deriva respecto a producción está vacía (salvo las excepciones listadas).
2. El harness se niega a ejecutarse contra producción; al terminar quedan 0 filas `sec_*`.
3. Cada caso M1.1 de T1–T33 aparece como `ok` en un run de Quality checks sobre un SHA concreto, con el log como evidencia.
4. Las guardas de CI de migraciones fallan si se viola alguna regla del punto 2.
5. Existe el registro as-built con las desviaciones y las evidencias. FND-001 pasa a COMPLETED solo cuando también estén cerrados los criterios de M1.2.

## Detalle técnico

- CI: un job nuevo `fnd001-db` en `quality-checks.yml`:
  1. `supabase start` con config temporal (PG 17);
  2. aplicar la cadena;
  3. `run-db-tests.sh`;
  4. `bunx vitest run validation/fnd001/access.test.ts`.
- `access.test.ts` falla (no se omite) si faltan las variables del stack local.
- Las claims simuladas en SQL usan `set_config('request.jwt.claims', …, true)` con `SET LOCAL ROLE`, solo como complemento de los JWT reales.
