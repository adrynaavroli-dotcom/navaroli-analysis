# D5 — Modelo de permisos «administración exclusiva»: diseño técnico consolidado

Fecha: 2026-11-13, revisión 2 2026-11-14 (UTC). Estado: **DISEÑO + SQL PROPUESTO + SIMULACIÓN. NO APLICADO EN
PRODUCCIÓN.** Revisión 2 = respuesta a la revisión del usuario (puntos 1–8, §13). Pendiente: PASS de CI sobre el
SHA final de esta revisión y autorización separada de la migración de producción (paso 5). FND-001 sigue
IN PROGRESS; M1.2 no ha empezado; la especificación canónica M1.1 no cambia; D-e y D-f siguen abiertas.

Requisito: `docs/security/admin-only-audit.md` §0 (memoria del proyecto y `AGENTS.md`).

## 1. Decisiones adoptadas (usuario, 2026-11-13)

| ID | Decisión | Cómo se refleja |
|---|---|---|
| D-a | D5 cubre **todas** las tablas de `public` (incluidas las 8 `sec_*`), secuencias y funciones | §5; helper `enforce_privilege_baseline()` recorre todo `public` |
| D-b | `user_roles` sin escritura vía API para nadie (admin incluido); helper sin argumentos | §5.3, §7; `is_admin()`; `has_role()` solo para `service_role` |
| D-c | `profiles` solo admin | §5.2 |
| D-d | Orden: diseño → simulación local → CI → PASS en el SHA → autorización de producción → frontend → regresión permanente | este documento; pasos 1–3 hechos |
| D4 | No se aplica por separado: su alcance (`sec_*`) queda dentro de D5 | `validation/fnd001/d4/*` marcado SUPERSEDED |

## 2. Identidades — qué ejecuta qué (verificado en solo lectura, `evidence/prod-platform-identity.txt`)

| Identidad | Uso | Evidencia |
|---|---|---|
| `postgres` | **Migrador**: dueño de todo `public` (tablas y funciones), del esquema `drizzle` y de `drizzle.__drizzle_migrations` y `supabase_migrations.schema_migrations`. Es quien ejecuta el DDL de las migraciones. No es superusuario; tiene CREATEROLE y BYPASSRLS; es miembro de ambos `sandbox_exec*` (no al revés) | §P2, §P4 |
| `sandbox_exec` | **Sesión ambiente del agente** (shell, consultas de solo lectura). LOGIN + BYPASSRLS, sin superusuario. No puede leer los diarios de migración (sin USAGE en `drizzle`/`supabase_migrations`) | §P1, §P3 |
| `sandbox_exec_<ref>` | Segunda credencial técnica del proyecto (mismos atributos; además EXECUTE en funciones por los default ACL) | audit §A1, §C1 |
| `supabase_admin` | Superusuario de la plataforma; dueño de `auth`, `net`, `cron`, `storage` (esquemas) y de `pg_net`/`pg_cron` | §P2, §P8 |

Conclusión: **el migrador (`postgres`) y `sandbox_exec*` son identidades distintas.** D5 retira escritura a
`sandbox_exec*` sin tocar al migrador, así que el mecanismo legítimo de migraciones no se rompe.
Todos los grants de `public` y los de `sandbox_exec*` en `storage` los emitió `postgres` (§P6, §P11 vacío),
por lo que el migrador puede revocarlos. El propietario de la identidad `postgres` es la plataforma
Lovable Cloud (no se necesita otra identidad privilegiada).

**Identidad del proceso de migración (punto 7).** Lo que la evidencia sí demuestra: los objetos creados por
la migración `0000_fnd001_m11_sec_schema` (aplicada por el mecanismo real de Lovable, sin `SET ROLE` en su SQL)
son de `postgres`, luego su `current_user` al crearlos era `postgres`. Lo que **no** demuestra:
`session_user` (el proceso podría conectar con otro rol y cambiar de rol). **`session_user` del migrador:
NO VERIFICADO.** No se ha podido comprobar en un entorno desechable con el mecanismo real: la herramienta de
migraciones de este proyecto aplica directamente sobre la base real (y crear un borrador con base propia
usaría una base local del sandbox, que no representa al proceso de producción). Mitigación incorporada: la
sección 0 de la migración D5 aborta si `current_user <> 'postgres'` y registra `current_user`/`session_user`
con un `NOTICE` en la salida de la migración; el postflight vuelve a comprobar la propiedad de los objetos.

NO VERIFICADO: con qué rol ejecuta la herramienta de cambios de datos del agente (consultas de escritura
fuera de migraciones). Si fuera `sandbox_exec*`, tras D5 dejaría de poder escribir datos de la aplicación
(efecto buscado); la recuperación del admin no depende de ella (§7).

## 3. Matriz objetivo (efectivo = privilegios SQL ∩ RLS)

| Objeto | anon | authenticated no-admin | admin | service_role | sandbox_exec* |
|---|---|---|---|---|---|
| `theses` | R publicadas | R publicadas | R todo, C/U/D | U(`current_price`,`sparkline_data`) | R |
| `public_thesis_data` (+vista) | R publicadas (columnas públicas) | R publicadas | R todo, C/U/D | U(4 columnas de revisión) | R |
| `page_content` | R | R | R, C, U (**sin D**, deliberado §7.1) | R | R |
| `analysis_workspaces`, `thesis_purchases` | — | — (0 filas) | R/C/U/D | R | R |
| `thesis_alerts` | — | — | R, U, D | R, C, U(`email_sent`) | R |
| `profiles` | — | — (ni el propio) | R/C/U/D | R | R |
| `user_roles` | — | R propia | R propia | R | R |
| `sec_*` | sin cambio M1.1 | sin cambio M1.1 | sin cambio M1.1 | sin cambio M1.1 | R |
| `is_admin()` | EXECUTE (false) | EXECUTE (false) | EXECUTE (true) | — | sufijo: EXECUTE |
| `has_role()` | — | **—** | **—** | EXECUTE | — |
| RPC `sec_*`, `enforce_privilege_baseline()` | — | — | — | RPC `sec_*` | — |
| TRUNCATE/REFERENCES/TRIGGER/MAINTAIN | — | — | — | — | — |
| `storage.buckets/objects` | sin cambio (RLS sin políticas) | ídem | ídem | sin cambio | R (**sin escritura de tabla ni de columna**) |
| escrituras por **columna** | ninguna | ninguna (sus escrituras son de tabla + RLS) | ídem | solo las 7 columnas de §4 | ninguna |
| `net` (pg_net, plataforma) | SQL: ALL vía PUBLIC; **no alcanzable por REST** | ídem | ídem | ídem | **ALL vía PUBLIC + EXECUTE http_*: riesgo abierto D-e** |

Columna «admin» = `authenticated` con JWT del admin; las escrituras pasan por RLS `is_admin()`.

## 4. Inventario de `service_role` (lo imprescindible)

| Función del servidor | Autorización | Lee | Escribe |
|---|---|---|---|
| `update-prices` | `CRON_SECRET` o JWT admin vía `has_role` | `theses` | `theses.current_price`, `theses.sparkline_data` |
| `check-thesis-alerts` | ídem | `public_thesis_data`, `profiles` (email de aviso) | `thesis_alerts` INSERT y `email_sent`; `public_thesis_data.{last_alert_sent_at, alert_type, needs_review, price_at_last_check}` |
| Ingesta SEC (M1.2, futura) | por diseñar en M1.2 | — | permisos M1.1 de `sec_*` sin cambio |

`service_role` conserva SELECT (las funciones leen con él) y `has_role` (comprobación del JWT admin).
Pierde el resto de escrituras, TRUNCATE y EXECUTE de funciones trigger. Riesgo: cualquier uso de
`service_role` no inventariado dejaría de escribir; la búsqueda en `supabase/functions/*` no encontró otros.

## 5. SQL propuesto — `validation/security/d5/d5-admin-only-migration.sql`

Una sola transacción, en este orden:

1. **`public.is_admin()`** — sin argumentos, STABLE SECURITY DEFINER, dueño `postgres`, `search_path=''`,
   false sin `auth.uid()`; lee `user_roles` directamente. EXECUTE solo `anon`, `authenticated`.
2. **Un único admin**: índice único parcial `user_roles_single_admin` (`WHERE role='admin'`).
3. **Políticas**: se sustituyen todas las de «propietario» y las de `has_role` por políticas cuyo USING/WITH
   CHECK es exactamente `is_admin()`; lecturas públicas `publicado OR is_admin()`. `user_roles` queda solo
   con «leer las propias»; `page_content` gana el WITH CHECK que le faltaba.
4. **Privilegios SQL** (defensa en profundidad bajo RLS): se revocan solo privilegios de escritura (un
   `REVOKE ALL` quitaría también el SELECT por columnas que `anon` tiene en `public_thesis_data`);
   `anon` pierde SELECT en tablas solo-admin; `service_role` queda en el inventario §4 con UPDATE por
   columnas; `has_role` deja de ser ejecutable por `authenticated`.
5. **Storage**: el helper (6) retira a `sandbox_exec*` las escrituras que `postgres` les concedió en
   `storage.buckets/objects` (tabla y columna) y lo verifica. No se tocan grants emitidos por
   `supabase_storage_admin`.
6. **`public.enforce_privilege_baseline()`** (sustituye al helper de D4): sobre **todo** `public` y las dos
   tablas de Storage deja `sandbox_exec*` solo con SELECT (tabla **y columna**) y EXECUTE de `is_admin()` y
   `sec_is_admin()` **por firma completa** (una sobrecarga como `is_admin(uuid)` no hereda nada); `anon` sin
   escritura de tabla ni de columna; `authenticated` sin escrituras por columna; `service_role` con escrituras
   por columna solo en el inventario §4 (`_svc_columns`, idéntico a la lista de la guarda, comprobado en la
   simulación); ningún rol API con TRUNCATE/REFERENCES (tabla o columna)/TRIGGER/MAINTAIN; PUBLIC sin nada.
   Recorre las entradas ACL de columna y las revoca. Postcondición sobre privilegios **efectivos** de tabla y
   de columna (`has_table_privilege`, `has_any_column_privilege`, `has_column_privilege`): si queda una vía
   — típicamente una concesión emitida por otro rol, que un REVOKE ignora con un aviso — aborta la
   transacción y nombra las vías. SECURITY INVOKER, solo ejecutable por el migrador. Toda migración futura
   que cree objetos en `public` (M1.2 incluida) termina con `SELECT public.enforce_privilege_baseline();` en su
   misma transacción (comprobación estática `validation/security/check-baseline-call.sh`).
0. **Identidad** (nuevo, punto 7): aborta si `current_user <> 'postgres'` y registra `current_user` y
   `session_user`.

No toca: ACL canónicos M1.1 de `anon/authenticated/service_role` en `sec_*`, `sec_is_admin()`,
default ACL globales, esquemas de `supabase_*` (`auth`, `net`, `cron`, `realtime`).

## 6. Storage, `net` y `cron`

| Vía | Hallazgo (solo lectura) | Resolución |
|---|---|---|
| `storage.buckets/objects` | Dueño `supabase_storage_admin`, RLS activo, 0 políticas, 0 buckets. `sandbox_exec*` tiene SELECT+INSERT **concedidos por `postgres`** (default ACL de `postgres` en `storage`) | D5 revoca ese INSERT (lo emitió el migrador). Los grants de `anon/authenticated` los emitió `supabase_storage_admin`: no se tocan; RLS sin políticas los deja inútiles |
| `net` (pg_net) | Dueño `supabase_admin`; **PUBLIC tiene ALL** en la cola, las respuestas y la secuencia; USAGE y EXECUTE de `http_*` para todos | **No revocable por el migrador**; no se ha tocado. **Reclasificado: riesgo ABIERTO, severidad media** (ya no INFO): primitiva SSRF y lectura/alteración/borrado de peticiones salientes al alcance de `sandbox_exec*`. Análisis completo, demostrado vs. hipotético y controles: `d-e-pg-net-analysis.md`. Guarda: líneas `risk|D-e|…` + regla G9 |
| `cron.schedule` | EXECUTE para todos, pero **USAGE en `cron` solo `postgres`/`supabase_admin`** | Inalcanzable para API y `sandbox_exec*`. La guarda falla si alguno obtiene USAGE. El migrador sí puede programar tareas: es su capacidad legítima |

## 7. Asignación y recuperación del administrador

### 7.1 `page_content`: el administrador **no** puede borrar (deliberado)

Antes de D5 nadie tenía política DELETE en `page_content`; D5 lo mantiene y además retira el privilegio
DELETE a `authenticated` (pruebas: `W A del page_content [grant]` y REST `A admin delete page_content
(deliberately closed)`). La aplicación no borra `page_content` en ningún sitio (solo lee y actualiza). Si
quieres que el admin pueda borrar, es un cambio de una política + un GRANT, con su prueba: decisión tuya.

- **Estado normal**: una sola fila `admin` (la de Adrian). Ninguna vía API escribe `user_roles`
  (privilegios revocados a `anon`, `authenticated` y `service_role`); el índice único impide un segundo
  admin incluso por vías privilegiadas.
- **Recuperación** (cuenta perdida o cambio de UID), solo por el migrador y con aprobación explícita:
  1. Adrian lo pide en el chat e identifica la cuenta nueva (email); el agente confirma por recuento que
     existe exactamente una cuenta con ese email, sin mostrar identificadores.
  2. Se prepara una migración revisada que, en una transacción, borra la fila admin anterior e inserta
     la nueva; el índice impide que convivan dos.
  3. Preflight y postflight con la guarda (§8) y recuento `user_roles:admin = 1`.
  Nunca desde el navegador, nunca por una función ejecutable por roles API. Mientras el registro siga
  desactivado en el servidor, una cuenta nueva solo puede crearla la plataforma.

### 7.2 Copias de seguridad: fuera de D5

Según la documentación de Lovable Cloud: copia automática diaria, conservada ~14 días, visible en el
proyecto en **More → Database → Manage → Backups**; **cualquier persona con permiso de edición del proyecto
puede restaurar** una copia (no hace falta ser propietario), la restauración sustituye la base entera y solo
en planes Enterprise queda en el registro de auditoría; las copias no incluyen archivos de Storage. Nada de
esto pasa por roles de la base de datos, así que D5 no lo controla. Una restauración podría devolver la base
a un estado anterior a D5 (o con otro admin). Verificación (la haces tú, en Lovable): (1) miembros del
proyecto/espacio con permiso de edición = solo tú; (2) revisar la lista de copias y su antigüedad; (3) tras
cualquier restauración, ejecutar el postflight (§10, guarda en solo lectura) antes de dar la base por buena.

## 8. Guarda de CI y pruebas

`validation/security/sql/admin-only-acl-guard.sql` (solo lectura; fija `search_path = pg_catalog, public` para
que ningún objeto de `public` pueda suplantar una función del catálogo) separa capas:

| Regla | Comprueba |
|---|---|
| G1 | Inventario revisado de tablas y de funciones **por firma completa** (`regprocedure`); RLS activo en toda tabla |
| G2 | PUBLIC sin privilegios en `public` |
| G3 | Escrituras **efectivas** (tabla y columna, explícitas, por PUBLIC o heredadas) ⊆ lista permitida; `anon` y `sandbox_exec*`: ninguna |
| G4 | EXECUTE efectivo ⊆ lista permitida, **por firma** |
| G5 | SECURITY DEFINER revisadas **por firma**, dueño `postgres`, `search_path` fijado |
| G6 | RLS: toda política de escritura fuera de `sec_*` es exactamente `is_admin()`; sin `has_role` en políticas; tablas solo-admin sin lectura sin `is_admin()` |
| G7 | Ningún rol API/plataforma es miembro de otro rol |
| G8 | `sandbox_exec*` sin escritura de tabla **ni de columna** en Storage; nadie con USAGE en `cron` |
| G9 | `pg_net`: ninguna función/vista de `public` alcanza `net`; nadie con CREATE en `net`; ningún trigger de usuario en tablas `net`. Los privilegios de plataforma se listan como `risk|D-e|…` (abierto, nunca PASS) |

`validation/security/sql/admin-only-tests.sql`: **237** casos (216 anteriores sin cambios + 21 nuevos): 19 de
privilegios **por columna** (concesión sobre una sola columna, no sobre la tabla, para anon, PUBLIC,
authenticated, service_role, ambos `sandbox_exec*` y las dos tablas de Storage: el helper revoca las no
autorizadas y conserva las 2 del inventario probadas), 1 de **aborto** (concesión emitida por otro grantor que
el migrador no puede revocar → la transacción aborta nombrando la vía) y 1 de **sobrecarga** (`is_admin(uuid)`
pierde EXECUTE para la plataforma mientras `is_admin()` lo conserva).

`validation/security/d5/run-d5-simulation.sh`: mocks (incluido `net` con los permisos de producción) →
cadena → guarda y pruebas **deben fallar** → D5 → guarda 0 + líneas `risk` → pruebas → T1–T33 → **19
sondas** → idempotencia → inventario único. **Cobertura exacta** (punto 5): exige 237/237 casos, 186/186 de
FND-001 y 19 sondas ejecutadas; un número menor es FAIL aunque todo lo ejecutado pase.

`validation/security/d5/rest-admin-only-check.ts` (punto 4): **72** comprobaciones por PostgREST con usuarios
de Auth reales en el stack efímero: `is_admin()` (anon/no-admin/admin/service_role), `has_role()`, lecturas
públicas solo de lo publicado, no-admin y anon sin crear/publicar/modificar/borrar tesis ni tocar
`page_content`, `profiles`, `user_roles`; admin con exactamente sus operaciones; `service_role` solo su
inventario; `net` inaccesible por REST para las cuatro identidades; un único admin al final. Número de
comprobaciones exigido en el propio script.

`validation/security/check-baseline-call.sh` (D-f): estático; desde la migración que crea el helper, toda
migración que cree objetos en `public` debe terminar con la llamada al helper; con autoprueba que demuestra
que puede fallar.

`validation/security/d5/pgnet-demo.sh` (D-e): en el stack desechable, ejerce como `sandbox_exec` los
privilegios de `net` (solo destinos 127.0.0.1:9) y documenta qué queda DEMONSTRATED / NOT DEMONSTRATED; no es
puerta de paso.

## 9. Resultados (NO oficiales: PostgreSQL 17.11 local + `local-shim.sql`; PostgREST 12.2.3 local)

| Paso | Resultado |
|---|---|
| Guarda antes de D5 | 244 violaciones; **idéntica línea a línea** a la guarda nueva ejecutada en solo lectura sobre producción (`evidence/prod-admin-only-guard.txt`); las 33 líneas `risk|D-e` del mock de `net` también idénticas a producción |
| Pruebas antes de D5 | 123/237 fallan |
| Versión anterior (CI `dca1318`) frente a las pruebas nuevas | 11 casos nuevos fallan (escrituras por columna de authenticated/service_role/Storage, aborto, sobrecarga); la guarda anterior daba **0 violaciones** a un `is_admin(uuid)` SECURITY DEFINER ejecutable por anon; la nueva da G1+G4+G5 |
| D5 | una transacción; identidad `current_user=postgres`; huella F0→F1: 208 retiradas, 32 añadidas, 0 líneas `sec_*` |
| Guarda después | 0 violaciones, 33 `risk|D-e` |
| Pruebas después | 237/237 (cobertura exacta) |
| FND-001 T1–T33 | 186/186 (cobertura exacta); rollback 0 filas |
| Sondas | 19/19 |
| Idempotencia / inventario único | catálogo byte-idéntico / 7 columnas idénticas |
| REST (PostgREST real; Auth simulado con JWT HS256, solo local) | 72/72 tras D5; sobre el esquema sin D5 fallan 36/68 → el arnés puede fallar. FND-001 `access-check.ts` 29/29 en el mismo orden que CI |
| Comprobación estática D-f | autoprueba OK; cadena actual: regla aún no armada (D5 no está en la cadena) |

## 10. Criterios de aceptación

**Paso 4 (CI, SHA con estos archivos):** jobs `quality`, `fnd001-db` y `admin-only-db` en verde; en
`admin-only-db`: comprobación estática D-f, guarda antes > 0, pruebas antes FAIL, guarda después 0, 237/237,
186/186, 19/19 sondas, idempotencia, inventario único, T20/T21 con JWT reales, arnés REST 72/72, demostración
`pg_net` registrada y guarda posterior 0 violaciones con líneas `risk`. (La revisión 1 pasó en el run
`43410417697` sobre `dca13189…`; la revisión 2 necesita su propio run.)

**Paso 5 (producción, solo tras autorización separada):**
1. Preflight solo lectura: huella de producción idéntica a la CI; guarda = las 244 violaciones conocidas.
2. La SQL de §5 se convierte, sin cambios, en una migración Drizzle; se aplica una vez.
3. Postflight solo lectura: guarda 0 violaciones (33 líneas `risk|D-e`, abiertas); huella = F1 de CI;
   la salida de la migración muestra `D5 executing identity: current_user=postgres, session_user=…`;
   recuentos `user_roles:admin = 1`, contenido no-admin = 0.
4. Prueba manual: la web pública muestra lo publicado; el panel admin sigue funcionando para Adrian;
   las dos funciones del servidor siguen actualizando precios y alertas.
5. Si cualquier punto falla, la migración se revierte con una migración inversa revisada (políticas y
   grants previos están en la huella F0).

**Paso 6 (frontend, después del 5):** guardia de rutas por `rpc('is_admin')` en `/admin`,
`/valuation-engine`, `/quant-matrix`, `/quant/*`; enlaces de administración ocultos a no-admin; sin
«Sign up» visible; registro desactivado en el servidor sin cambios.

## 11. Riesgos y decisiones abiertas

- **D-e `pg_net`: ABIERTA**, reclasificada de INFO a riesgo medio (`d-e-pg-net-analysis.md`). Opciones: aceptar
  temporalmente con los controles compensatorios, o pedir a la plataforma que retire `net` a PUBLIC y a
  `sandbox_exec*`.
- **D-f default ACL: ABIERTA** (no se cierra hasta alinear mecanismo de migraciones, guardas y bloqueo de
  despliegue). Se mantienen sin cambios los default privileges globales. Qué vuelve a concederse **en cada
  objeto nuevo** creado por `postgres` (evidencia §P9):

  | Esquema / tipo | anon, authenticated, service_role | `sandbox_exec` | `sandbox_exec_<ref>` | PUBLIC |
  |---|---|---|---|---|
  | `public` tablas, vistas | ALL (`arwdDxtm`) | SELECT, INSERT | SELECT, INSERT | — |
  | `public` secuencias | SELECT, UPDATE, USAGE | SELECT, USAGE | SELECT, USAGE | — |
  | `public` funciones | EXECUTE | — | EXECUTE | EXECUTE (por defecto de PostgreSQL) |
  | `storage` (objetos que cree `postgres`) | igual que `public` | igual | igual | igual |
  | `auth`, `extensions` | — | SELECT, INSERT (tablas); SELECT, USAGE (secuencias) | ídem + EXECUTE | — |

  Objetos creados por `supabase_admin` en `public` reciben ALL para los roles API según su propio default ACL;
  el helper no puede revocarlos (no es el emisor) y abortaría la migración.

  Controles que impiden que lleguen a producción, y su límite real:

  | Control | Dónde actúa | Límite |
  |---|---|---|
  | `SELECT public.enforce_privilege_baseline()` al final de la migración | dentro de la transacción en producción; aborta si queda una vía | depende de que la migración lo incluya |
  | `check-baseline-call.sh` | CI (estático) | CI corre **después** de que Lovable aplique la migración |
  | Guarda en la simulación de CI | CI | ídem |
  | Postflight con la guarda (solo lectura) tras cada migración | producción | detecta, no impide; hay una ventana entre aplicar y comprobar |
  | Bloqueo de despliegue (`deploy-gating-proposal.md`) | GitHub Pages | propuesta; no cubre la base de datos ni la publicación de Lovable |
  | Regla en `AGENTS.md` (admin-only) | agente | procedimental |

  Conclusión: hoy **ningún control de CI puede impedir** que una migración llegue a la base real, porque Lovable
  la aplica al ejecutarla; la protección efectiva es el helper dentro de la misma transacción (con su
  postcondición) más el postflight. Por eso D-f sigue abierta.
- La plataforma podría volver a conceder grants a `sandbox_exec*` en objetos existentes: lo detecta el
  postflight periódico con la guarda.
- Copias de seguridad (§7.2) y publicación de Lovable: fuera de D5; dependen de quién tiene permiso de edición.
- Fuera de la base de datos (lo revisas tú): miembros del proyecto Lovable, colaboradores y protección de
  rama en GitHub, 2FA (`deploy-gating-proposal.md` §3B).

## 12. Archivos

| Archivo | Papel |
|---|---|
| `validation/security/d5/d5-admin-only-migration.sql` | SQL propuesto (no en la cadena) |
| `validation/security/d5/run-d5-simulation.sh` | simulación en base desechable |
| `validation/security/sql/admin-only-acl-guard.sql` | guarda (CI + postflight) |
| `validation/security/sql/admin-only-tests.sql` | pruebas de comportamiento |
| `validation/security/sql/d5-platform-mock.sql` | estado de plataforma de producción en la base desechable |
| `validation/security/d5/rest-admin-only-check.ts` | arnés REST con usuarios reales (CI) |
| `validation/security/d5/pgnet-demo.sh` | demostración D-e en stack desechable (CI) |
| `validation/security/check-baseline-call.sh` | comprobación estática D-f (CI) |
| `validation/security/platform-identity-probe.sql` | consulta de solo lectura de identidades/Storage/net/cron (§P13–§P14 nuevas) |
| `docs/security/evidence/prod-platform-identity.txt`, `prod-admin-only-guard.txt`, `prod-net-rest-exposure.txt` | evidencia de producción (solo lectura) |
| `docs/security/d-e-pg-net-analysis.md` | análisis D-e |
| `docs/security/deploy-gating-proposal.md`, `proposals/deploy-pages.gated.yml` | propuesta de bloqueo de despliegue (no activa) |

## 13. Revisión 2 — respuesta a los puntos 1–8 (2026-11-14)

| Punto | Resuelto | Dónde |
|---|---|---|
| 1 Firma completa | Inventario, EXECUTE y SECURITY DEFINER por `regprocedure` en guarda y helper; 3 sondas de sobrecarga + 1 caso | §8, §9 |
| 2 Columnas | Helper revoca y verifica escrituras por columna (incl. Storage) y aborta; 19 casos + 4 sondas + caso de aborto | §5.6, §8 |
| 3 `pg_net` | Reclasificado; demostrado vs. hipotético; G9 + `risk`; demo en CI; sin cambios de permisos | §6, `d-e-pg-net-analysis.md` |
| 4 REST con JWT reales | Arnés de 72 comprobaciones en el job `admin-only-db` | §8 |
| 5 Cobertura | Recuentos exactos (237, 186, 19, 72) | §8 |
| 6 Despliegue | Propuesta, sin cambios en GitHub | `deploy-gating-proposal.md` |
| 7 Migrador y backups | `current_user` demostrado; `session_user` **NO VERIFICADO** + aserción en D5; backups fuera de D5 | §2, §7.2 |
| 8 D-f y `page_content` | Tabla de default ACL y controles; D-f abierta; borrado de `page_content` deliberadamente cerrado | §11, §7.1 |

