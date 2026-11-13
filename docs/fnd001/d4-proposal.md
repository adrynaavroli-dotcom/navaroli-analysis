# FND-001 / M1.1 — D4: retirar a `sandbox_exec*` la escritura directa en `sec_*` (propuesta revisada)

> **SUSTITUIDA (2026-11-13)** por el modelo D5, que incluye este alcance (`sec_*`) en una única estrategia de permisos: `docs/security/d5-design.md`. No aplicar D4 por separado. Se conserva como registro de la simulación de D4.

Fecha: 2026-11-11 (UTC). Estado: **propuesta, NO autorizada, NO ejecutada**. Producción sin cambios.
Sustituye a la propuesta de `d3-catalog-report.md` §6. FND-001 sigue **IN PROGRESS**; M1.1 no se cierra sin decisión explícita sobre D4.

## 1. Alcance exacto

| | Qué |
|---|---|
| Roles afectados | Los que cumplan `^sandbox_exec(_[a-z0-9]+)?$`: hoy `sandbox_exec` y `sandbox_exec_<project-ref>` (D3 §3.2). Se descubren por patrón; el project-ref no se escribe en el repositorio |
| Objetos afectados | Solo `public.sec_*`: 8 tablas, 4 RPC de corrida, 4 funciones de trigger y el helper nuevo |
| Se revoca | Tablas: `INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN` (hoy solo tienen INSERT; el resto se revoca por si acaso, sin efecto). Secuencias `sec_*`: `USAGE, UPDATE` (hoy no existe ninguna). Rutinas `sec_*`: `EXECUTE`, salvo `sec_is_admin()` |
| Se conserva | `SELECT` en las 8 tablas; `EXECUTE` en `sec_is_admin()` y en `has_role()` (§4) |
| No se toca | `pg_default_acl` (default privileges globales); ACL de `anon`, `authenticated`, `service_role`, `authenticator` y `postgres`; `has_role()`, `user_roles` y cualquier objeto que no sea `sec_*` |
| Objeto nuevo | `public.sec_lockdown_platform_privileges()`: SECURITY INVOKER, propietario `postgres`, sin EXECUTE para `PUBLIC`/`anon`/`authenticated`/`service_role` |

## 2. SQL definitivo

Fichero: `validation/fnd001/d4/d4-migration.sql` (SHA-256 `bcb521c8…2a8403`). Fuera de la cadena de migraciones y fuera de CI.
Si se autoriza, ese texto exacto se aplica como migración Drizzle a medida y el fichero sale de `validation/`.

Estructura:
1. `CREATE FUNCTION public.sec_lockdown_platform_privileges() RETURNS integer`, SECURITY INVOKER, con `search_path = ''`:
   - recorre los roles `sandbox_exec*` y los objetos `public.sec_*`;
   - emite los `REVOKE` del §1;
   - **postcondición** sobre privilegios efectivos (`has_table_privilege`, `has_sequence_privilege`, `has_function_privilege`), que incluye las vías por `PUBLIC` o por pertenencia. Si queda alguna vía de escritura, lanza `RAISE EXCEPTION` y la migración entera se revierte. Así se cubre el caso en que el `REVOKE` lo emite alguien sin propiedad, que en PostgreSQL solo produce un WARNING.
2. `ALTER FUNCTION … OWNER TO postgres`, igual que las funciones de M1.1.
3. `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated, service_role`: sin esto, los default privileges la expondrían como RPC REST.
4. `SELECT public.sec_lockdown_platform_privileges();` → 34 revocaciones (2 roles × 17 objetos).

Las funciones de trigger siguen disparándose: PostgreSQL solo comprueba EXECUTE al crear el trigger, no al dispararlo. Lo comprueba la suite T1–T33 tras D4 (§7).

## 3. Riesgos

1. **Que la plataforma vuelva a conceder los permisos.** NOT VERIFIED.
   - Mitigación: el guard (§6) en cada postflight y tras cada migración SEC.
2. **Herramientas del agente.** Cualquier herramienta que use `sandbox_exec*` deja de poder escribir en `sec_*` y de ejecutar las RPC. Es el efecto buscado.
   - Qué rol usan las herramientas de consulta de datos de Lovable: NOT VERIFIED.
   - Las correcciones de datos en `sec_*` pasarán a hacerse solo por las RPC o con una migración.
3. **Cambio de nombre de los roles.** El helper no revocaría nada.
   - Mitigación: la regla R1 del guard es genérica y marca a cualquier rol no autorizado, sea cual sea su nombre.
4. **Migrador sin propiedad.** Si el rol que aplica la migración no es propietario, la postcondición aborta la migración. Fallo ruidoso, sin aplicación parcial.
5. **Objetos M1.2 sin la llamada al helper.** La guarda de CI los detecta antes del merge (§5 y §6).
6. **`MAINTAIN` requiere PostgreSQL 17.** Producción usa 17.6 y CI 17.11.
7. **Reversión.** Si hiciera falta, hay que aplicar otra migración con un bloque simétrico: `GRANT INSERT` en las 8 tablas y `EXECUTE` en las 8 rutinas a los roles que cumplan el patrón. Queda documentado; no se ha preparado.

## 4. `has_role(uuid, app_role)` para `sandbox_exec_<project-ref>`: **conservar**

1. **No da ninguna capacidad nueva.** El rol ya tiene `SELECT` en `public.user_roles` y BYPASSRLS (D3 §6). Puede leer todos los roles directamente, y `has_role` solo devuelve un booleano derivado de esa tabla.
2. **No interviene en RLS para este rol.** Con BYPASSRLS las políticas no se evalúan. `sec_is_admin()` es SECURITY DEFINER y llama a `has_role` como `postgres`, así que revocarlo no le afectaría.
3. **Queda fuera del límite de D4.** No es un objeto `sec_*`, y la decisión vigente es no cambiar los grants de `has_role`. Revocarlo cambiaría la ACL de una función global sin reducir el riesgo.
4. **El riesgo real está en otro sitio.** Ambos roles tienen **INSERT en `public.user_roles`** (D3 §6). Con credenciales `sandbox_exec*` se podría insertar un rol `admin`. Es un hallazgo fuera del alcance de D4 y no se propone cambiarlo aquí. Si quieres tratarlo, sería otra decisión (D5), con su propio análisis.

`sec_is_admin()` también se conserva. La sesión puede fijar `request.jwt.claims` y consultar si un UUID es admin, pero esa información ya la tiene por `SELECT` en `user_roles`.

## 5. Objetos nuevos de M1.2: mismas revocaciones, sin ventana

Cada migración SEC de M1.2 que cree o reemplace objetos `sec_*`:
1. sigue la convención de M1.1: `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` y después los `GRANT` explícitos que apruebe su diseño;
2. termina con `SELECT public.sec_lockdown_platform_privileges();`.

**Por qué no queda ventana:** la herramienta aplica cada migración en una sola transacción. Los grants que añaden los default privileges al crear el objeto están en filas de catálogo sin confirmar, que ninguna otra sesión puede ver. Cuando se confirma la transacción, ya están revocados. Si falta el paso 1 para `PUBLIC`, la postcondición del helper aborta la migración (caso 4e de §7).

Cuando se autorice D4, se añadirá a `AGENTS.md` la regla: «toda migración SEC termina con la llamada al helper».

## 6. Guarda de CI y criterio de postflight

`validation/fnd001/sql/sec-platform-acl-guard.sql` es de solo lectura: solo hace `SELECT` sobre `pg_catalog` y usa funciones de privilegio. Reglas:
- **R1 (ACL explícita):** un grantee que no sea el propietario ni `anon`/`authenticated`/`service_role` solo puede tener `SELECT` en relaciones y secuencias `sec_*`, y `EXECUTE` en `sec_is_admin()`. `PUBLIC` no puede tener nada.
- **R2 (privilegio efectivo):** ningún rol `sandbox_exec*` puede tener vía de escritura ni `EXECUTE`, salvo en `sec_is_admin()`.
- La ACL de los roles de la API no la juzga el guard: la fija la huella `catalog-fingerprint.sql`, que debe coincidir con la línea base.

**Uso propuesto, solo cuando se autorice D4 y en el mismo cambio:**
- **CI, `fnd001-db`:**
  - `sql/ci-platform-roles-mock.sql` antes de reconstruir la cadena, para reproducir en el stack desechable los roles y default privileges de producción (NOLOGIN);
  - después, el guard, con 0 violaciones exigidas;
  - y `sql/d4-behaviour-checks.sql`.
  - Una migración M1.2 que olvide el helper rompe el job.
- **Comprobación estática:** nuevo punto 8 de `check-migration-chain.sh`. Toda migración Drizzle posterior a D4 que mencione `sec_` debe contener la llamada al helper.
- **Postflight en producción:** `run-d3-catalog.sh`, en sesión de solo lectura, ejecuta además el guard. Hay que repetirlo tras cada migración SEC.

Hoy **no** está conectado a CI: con la cadena actual, sin D4, el guard fallaría por diseño.

## 7. Comprobaciones

### 7.1 Simulación local (no oficial)
2026-11-11, PostgreSQL 17.11 desechable en loopback, con shim y mock de roles. Evidencia en `docs/fnd001/evidence/d4-sim/`.

| Paso | Resultado |
|---|---|
| Huella F0 tras la cadena, con los roles simulados | 906 líneas, **idéntica** a la de CI y producción (`a3a94a80…1b309`). El mock no altera la huella |
| Guard antes de D4 | **48 violaciones**, el mismo perfil que producción (D3 §§6–9): INSERT en las 8 tablas para los 2 roles y EXECUTE en 8 rutinas para el rol con sufijo, cada una en R1 y R2 |
| Aplicar `d4-migration.sql` | 34 revocaciones, sin errores |
| Guard después de D4 | **0 violaciones** |
| Huella F0 → F1 | Solo 2 líneas nuevas, ambas del helper (`fn` y `fnacl` con EXECUTE solo para `postgres`). **ACL de los roles de la API sin cambios** |
| Comportamiento | **56/56 ok**: INSERT denegado (42501) en 8 tablas × 2 roles; SELECT conservado en 8 × 2; EXECUTE denegado (42501) en las 4 RPC y el helper × 2; EXECUTE revocado en las 4 funciones de trigger; `sec_is_admin` y `has_role` conservados; INSERT en `user_roles` sin tocar; las API sin EXECUTE en el helper; `service_role` conserva las 4 RPC; segunda llamada idempotente |
| T1–T33 tras D4 | **186/186**, 0 filas tras el rollback. Los triggers y las RPC siguen funcionando |
| 4c: objeto M1.2 sin helper | El guard detecta **8 violaciones** |
| 4d: objeto M1.2 con convención y helper | **0 violaciones** |
| 4e: rutina M1.2 ejecutable por `PUBLIC` | El helper **aborta** («2 write path(s) remain») |

Script: `validation/fnd001/d4/run-d4-simulation.sh`, protegido por `lib/guard.sh`.

### 7.2 En producción, cuando se autorice
Todas las consultas en sesión de solo lectura (`run-d3-catalog.sh`):
1. **Preflight:**
   - la huella debe ser igual a la línea base `a3a94a80…`;
   - el guard debe dar exactamente 48 violaciones, con el perfil anterior.
   - Si algo difiere, se para.
2. **Aplicar** la migración. Es una única transacción.
3. **Postflight:**
   - guard con 0 violaciones;
   - diff de la huella con la línea base igual a exactamente las 2 líneas del helper;
   - `d3-platform-roles.sql` §8: `sel = t` e `ins = f` para 2 roles × 8 tablas;
   - §9: `sandbox_exec_<ref>` con `f` en las 4 RPC y los 4 triggers, y `t` en `sec_is_admin` y `has_role`;
   - las filas de `anon`, `authenticated`, `authenticator` y `service_role` idénticas a las de antes;
   - §5 (`pg_default_acl`) idéntico;
   - §6 sin cambios para tablas que no sean `sec_*`.
4. En producción **no** se prueba un INSERT real: en una sesión de solo lectura daría 25006 antes que 42501, y D3 no autoriza DML. La denegación efectiva se prueba en CI con el mock y en producción con las funciones de privilegio.
5. Después, un run de CI con el mock y el guard ya conectados, sobre el SHA que contenga la migración.
