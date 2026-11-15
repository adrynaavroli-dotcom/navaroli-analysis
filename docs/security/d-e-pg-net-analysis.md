# D-e — `pg_net`: revisión ampliada del riesgo residual

Fecha: 2026-11-14 (UTC). Estado: **ABIERTO. No aceptado como INFO.** No se ha cambiado ningún permiso de
`pg_net` ni de otro esquema interno de la plataforma (no hay autorización para ello).

Evidencia (solo lectura): `evidence/prod-platform-identity.txt` §P8, §P13, §P14;
`evidence/prod-admin-only-guard.txt` (líneas `risk|D-e|…`); `evidence/prod-net-rest-exposure.txt`.
Demostración práctica: solo en el stack desechable de CI (`validation/security/d5/pgnet-demo.sh`, artefacto
`d5-evidence/pgnet-demo.txt`). En producción **no** se ha insertado, modificado ni borrado nada: ejercer estos
privilegios allí sería DML sobre la base real.

## 1. Qué está demostrado (catálogo de producción)

| Hecho | Evidencia |
|---|---|
| `pg_net` 0.19.5, dueño `supabase_admin`; esquema `net` con USAGE para **PUBLIC** y para anon, authenticated, service_role | §P8 |
| `net.http_request_queue`, `net._http_response` y la secuencia `http_request_queue_id_seq`: **PUBLIC tiene ALL** (`=arwdDxtm/supabase_admin`, secuencia `=rwU`). Por tanto `sandbox_exec*` (y cualquier rol) puede SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER y MAINTAIN, y usar la secuencia | §P14 `net-table-acl`, §P13 `sequence:` |
| `net.http_get/post/delete`: EXECUTE para todos (SECURITY INVOKER) | §P8 |
| La cola guarda la petición completa: `method, url, headers jsonb, body bytea, timeout` hasta que el worker la envía | §P13 `columns:` |
| Las respuestas (`status_code, headers, content, error_msg`) se conservan **6 horas** (`pg_net.ttl`); el worker conecta como `postgres` a la base `postgres`, lotes de 200 | §P13 `setting:` |
| `sandbox_exec*` **no** tiene USAGE en `cron` ni en `vault`: no puede leer `cron.job` (comandos y cabeceras programadas) ni los secretos | §P13 `schema-usage:` |
| Ningún rol API/plataforma tiene CREATE en ningún esquema (temporales aparte); `sandbox_exec*` sí tiene TEMP; puede ejecutar 22/28 funciones `trigger` ya existentes; hoy hay **0** triggers de usuario en tablas `net` | §P14 |
| La API pública **no** expone `net` ni `cron`: `Accept-Profile: net` → HTTP 406 `PGRST106` («solo public, graphql_public»); no existe RPC `public.http_get`; GraphQL desactivado | `prod-net-rest-exposure.txt` |
| Ninguna función ni vista de `public` referencia `net` | guarda G9 (0 violaciones) |

## 2. Respuestas a las preguntas

**¿Puede `sandbox_exec*` insertar, alterar o eliminar solicitudes directamente?** Sí, por privilegios: INSERT
directo en la cola (con o sin `id` explícito, tiene USAGE en la secuencia), UPDATE de cualquier fila pendiente
(URL, cabeceras, cuerpo), DELETE y TRUNCATE de la cola y de las respuestas. Demostrado en catálogo de producción;
ejercido en el stack desechable (`pgnet-demo.sh`: `queue-insert`, `http_post`, `rewrite-pending`,
`delete-responses`, `truncate-queue`).

**¿Qué peticiones HTTP podría originar?** Cualquier método GET/POST/DELETE a cualquier URL, con cabeceras y
cuerpo arbitrarios, enviadas por el worker de `pg_net` **desde la red del servidor de base de datos**, no desde
el sandbox. Demostrado en el stack desechable que el worker ejecuta lo que encola un rol de plataforma
(`worker-sends`, si el worker corre en ese stack). Qué destinos son alcanzables desde la red de producción:
**NO VERIFICADO** (no se puede comprobar sin enviar peticiones desde producción).

**SSRF / servicios internos / acciones en endpoints externos.**
- Demostrado: el origen de la petición es el servidor de BD, distinto del sandbox. Eso es la definición de una
  primitiva SSRF.
- Hipotético (NO VERIFICADO): alcance a servicios internos de la plataforma (API interna, metadatos del
  proveedor cloud, otros servicios de la red privada). Depende del filtrado de salida de Lovable Cloud, que no
  es observable desde el catálogo.
- Hipotético con ventana temporal: leer las cabeceras de una petición **pendiente** de otro rol (p. ej. una
  tarea programada que envíe `x-cron-secret`), o reescribir su URL antes de que el worker la envíe. Requiere
  ganar una carrera de milisegundos y que la tarea programada use `pg_net` con el secreto en cabeceras; lo
  segundo **NO VERIFICADO** porque `cron.job` no es legible por `sandbox_exec*`. Con `CRON_SECRET` alguien solo
  podría disparar `update-prices` / `check-thesis-alerts`, cuyas escrituras D5 limita al inventario por columnas
  (precios, sparkline, campos de revisión y alertas): no hay vía a contenido, configuración ni roles.
- Hipotético: leer durante 6 h el contenido de las respuestas de peticiones de otros (resultado de funciones
  del servidor llamadas por cron).
- **Corregido 2026-11-15 (revisión 3) — `TRIGGER` sí permite colgar código existente.** La versión anterior
  suponía que hacía falta CREATE en un esquema. Falso: PostgreSQL exige solo el privilegio TRIGGER sobre la
  tabla y EXECUTE sobre una función trigger **ya existente** (documentación de CREATE TRIGGER). Ver §4.
- Disponibilidad (demostrado por privilegios): borrar o truncar la cola anula las tareas programadas
  pendientes.

**Controles compensatorios si el migrador no puede revocar.**
1. La API REST no expone `net`/`cron` (verificado en producción, y en CI para anon/no-admin/admin/service_role
   con `rest-admin-only-check.ts`, comprobaciones `N`). anon/authenticated solo existen detrás de PostgREST, así
   que sus privilegios SQL en `net` no son alcanzables desde la web.
2. G9 (CI y postflight): ninguna función o vista de `public` puede alcanzar `net`; nadie puede CREATE en `net`;
   ningún trigger de usuario en tablas `net` (detecta el ataque de §4 a posteriori, no lo impide); líneas
   `risk|D-e|trigger-attach …` con el número de funciones trigger existentes que cada rol podría colgar.
   D5 retira EXECUTE de todas las funciones trigger de `public` a roles API y de plataforma.
3. `sandbox_exec*` sin USAGE en `vault` ni `cron` (vigilado por G8 para `cron`).
4. D5 reduce el impacto de un `CRON_SECRET` filtrado al inventario por columnas de `service_role`.
5. Higiene recomendable (fuera de D5, decisión tuya): rotar `CRON_SECRET` periódicamente.
6. La retirada real (revocar `net` a PUBLIC/`sandbox_exec*`) solo la puede hacer la plataforma
   (`supabase_admin`). Acción propuesta: pedírselo a Lovable; mientras tanto, el riesgo queda **abierto**.

## 3. Clasificación

| Antes | Ahora |
|---|---|
| INFO («no es vía de datos ni de admin») | **ABIERTO, severidad media**: primitiva SSRF y manipulación/lectura de peticiones salientes al alcance de credenciales técnicas; sin vía demostrada a datos de la aplicación, contenido, configuración ni roles; explotación de secretos solo hipotética y dependiente de carreras y de configuración no verificable |

La guarda deja de emitir `info|pg_net…` y emite `risk|D-e|…` (33 líneas en producción). Nunca cuentan como PASS.
La decisión D-e (aceptar temporalmente con los controles anteriores o pedir la retirada a la plataforma) sigue
pendiente de ti.

## 4. Revisión 3 (2026-11-15): CREATE TRIGGER con funciones existentes

Ejecutado solo en la base desechable local (PostgreSQL 17.11, esquema `net` **simulado**:
`validation/security/sql/d5-platform-mock.sql`, sin worker) con `validation/security/d5/pgnet-demo.sh` §5. En CI
el mismo script intenta cambiar el mock por la extensión `pg_net` real del stack; el resultado oficial es el
artefacto `d5-evidence/pgnet-demo.txt` del job `admin-only-db`. El run anterior (43589501422) se ejecutó también
sobre el mock (`net owner = postgres`, sin `extversion`), así que **ningún resultado de pg_net real existe aún**.

| Comprobación | Resultado (local, mock) |
|---|---|
| TRIGGER efectivo de `sandbox_exec` y `sandbox_exec_<ref>` en `net.http_request_queue` y `net._http_response` | **Sí** en las cuatro combinaciones (PUBLIC ALL, como en producción §P14) |
| Funciones trigger existentes (sin argumentos) ejecutables | 16 de 22 para ambos roles: las 16 de `pg_catalog` (`RI_FKey_*`, `suppress_redundant_updates_trigger`, `tsvector_update_trigger[_column]`, `unique_key_recheck`); las 6 de `public` no, tras D5. Producción hoy (sin D5): 22 y 28 (§P14; nombres NO VERIFICADOS) |
| `sandbox_exec` crea un trigger en ambas tablas con `pg_catalog.tsvector_update_trigger` (sin CREATE en ningún esquema) | **DEMOSTRADO** (transacción revertida) |
| Con ese trigger, el INSERT en `net._http_response` (la escritura que hace el worker tras cada petición) | **Falla** (`column "content" is not of tsvector type`) |
| Con ese trigger, `net.http_get` para cualquier llamante (incluidas las tareas programadas) | **Falla** (`column "url" is not of tsvector type`) |
| `sandbox_exec` puede DROP / DISABLE el trigger | **No** (`must be owner`): solo el dueño de la tabla lo retira; en producción es `supabase_admin`, no el migrador |
| Efecto sobre el worker real | **NO VERIFICADO**: no hay worker en el mock. En CI se ejecuta solo si la extensión es real y la sesión puede retirar el trigger después |

Conclusión: `sandbox_exec*` puede, con privilegios ya presentes en producción, **bloquear todas las peticiones
salientes de `pg_net`** (cola) y **las escrituras de respuestas del worker**, de forma persistente y sin poder
deshacerlo ni el migrador. No da acceso a datos, contenido, configuración ni roles: las funciones disponibles son de
`pg_catalog` y se ejecutan con los datos de la fila. Una función SECURITY DEFINER de `public` (p. ej.
`handle_new_user`) colgada así hoy correría como `postgres`; D5 lo cierra retirando EXECUTE de todas las
funciones trigger de `public` (casos H5 de `admin-only-tests.sql`). Clasificación: sigue **ABIERTO, severidad
media**, con la disponibilidad como impacto demostrado. La decisión D-e sigue siendo tuya.
