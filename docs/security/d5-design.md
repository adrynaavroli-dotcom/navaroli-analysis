# D5 — Modelo de permisos «administración exclusiva»: diseño técnico consolidado

Fecha: 2026-11-13 (UTC). Estado: **DISEÑO + SQL PROPUESTO + SIMULACIÓN LOCAL. NO APLICADO EN PRODUCCIÓN.**
Pendiente: PASS de CI sobre el SHA que contiene estos archivos (paso 4) y autorización separada de la
migración de producción (paso 5). FND-001 sigue IN PROGRESS; M1.2 no ha empezado; la especificación
canónica M1.1 no cambia.

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

NO VERIFICADO: con qué rol ejecuta la herramienta de cambios de datos del agente (consultas de escritura
fuera de migraciones). Si fuera `sandbox_exec*`, tras D5 dejaría de poder escribir datos de la aplicación
(efecto buscado); la recuperación del admin no depende de ella (§7).

## 3. Matriz objetivo (efectivo = privilegios SQL ∩ RLS)

| Objeto | anon | authenticated no-admin | admin | service_role | sandbox_exec* |
|---|---|---|---|---|---|
| `theses` | R publicadas | R publicadas | R todo, C/U/D | U(`current_price`,`sparkline_data`) | R |
| `public_thesis_data` (+vista) | R publicadas (columnas públicas) | R publicadas | R todo, C/U/D | U(4 columnas de revisión) | R |
| `page_content` | R | R | R, C, U | R | R |
| `analysis_workspaces`, `thesis_purchases` | — | — (0 filas) | R/C/U/D | R | R |
| `thesis_alerts` | — | — | R, U, D | R, C, U(`email_sent`) | R |
| `profiles` | — | — (ni el propio) | R/C/U/D | R | R |
| `user_roles` | — | R propia | R propia | R | R |
| `sec_*` | sin cambio M1.1 | sin cambio M1.1 | sin cambio M1.1 | sin cambio M1.1 | R |
| `is_admin()` | EXECUTE (false) | EXECUTE (false) | EXECUTE (true) | — | sufijo: EXECUTE |
| `has_role()` | — | **—** | **—** | EXECUTE | — |
| RPC `sec_*`, `enforce_privilege_baseline()` | — | — | — | RPC `sec_*` | — |
| TRUNCATE/REFERENCES/TRIGGER/MAINTAIN | — | — | — | — | — |
| `storage.buckets/objects` | sin cambio (RLS sin políticas) | ídem | ídem | sin cambio | R (**sin INSERT**) |

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
5. **Storage**: se revocan a `sandbox_exec*` los INSERT que `postgres` les concedió en
   `storage.buckets/objects`, con comprobación posterior. No se tocan grants emitidos por
   `supabase_storage_admin`.
6. **`public.enforce_privilege_baseline()`** (sustituye al helper de D4): sobre **todo** `public` deja
   `sandbox_exec*` solo con SELECT y EXECUTE de `is_admin`/`sec_is_admin`; `anon` sin escritura;
   ningún rol API con TRUNCATE/REFERENCES/TRIGGER/MAINTAIN; PUBLIC sin nada. Postcondición sobre
   privilegios **efectivos**: si queda una vía, aborta la migración entera. SECURITY INVOKER, solo
   ejecutable por el migrador. Toda migración futura que cree objetos en `public` (M1.2 incluida)
   termina con `SELECT public.enforce_privilege_baseline();` en su misma transacción.

No toca: ACL canónicos M1.1 de `anon/authenticated/service_role` en `sec_*`, `sec_is_admin()`,
default ACL globales, esquemas de `supabase_*` (`auth`, `net`, `cron`, `realtime`).

## 6. Storage, `net` y `cron`

| Vía | Hallazgo (solo lectura) | Resolución |
|---|---|---|
| `storage.buckets/objects` | Dueño `supabase_storage_admin`, RLS activo, 0 políticas, 0 buckets. `sandbox_exec*` tiene SELECT+INSERT **concedidos por `postgres`** (default ACL de `postgres` en `storage`) | D5 revoca ese INSERT (lo emitió el migrador). Los grants de `anon/authenticated` los emitió `supabase_storage_admin`: no se tocan; RLS sin políticas los deja inútiles |
| `net.http_post` / `net.http_request_queue` | Dueño `supabase_admin`; EXECUTE por PUBLIC y USAGE en `net` para API y `sandbox_exec*` | **No revocable por el migrador** y fuera de alcance («no modificar esquemas internos»). No es vía de escritura de datos ni de admin: las funciones que escriben exigen `CRON_SECRET` o JWT admin, que `sandbox_exec*` no puede leer (sin USAGE en `vault`). La API REST no expone `net`. Queda como **riesgo residual INFO** en la guarda (decisión D-e) |
| `cron.schedule` | EXECUTE para todos, pero **USAGE en `cron` solo `postgres`/`supabase_admin`** | Inalcanzable para API y `sandbox_exec*`. La guarda falla si alguno obtiene USAGE. El migrador sí puede programar tareas: es su capacidad legítima |

## 7. Asignación y recuperación del administrador

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

## 8. Guarda de CI y pruebas

`validation/security/sql/admin-only-acl-guard.sql` (solo lectura) separa capas:

| Regla | Comprueba |
|---|---|
| G1 | Inventario revisado de tablas y funciones (las nuevas fallan hasta revisarse); RLS activo en toda tabla |
| G2 | PUBLIC sin privilegios en `public` |
| G3 | Escrituras **efectivas** (tabla y columna, explícitas, por PUBLIC o heredadas) ⊆ lista permitida; `anon` y `sandbox_exec*`: ninguna |
| G4 | EXECUTE efectivo ⊆ lista permitida |
| G5 | SECURITY DEFINER revisadas, dueño `postgres`, `search_path` fijado |
| G6 | RLS: toda política de escritura fuera de `sec_*` es exactamente `is_admin()`; sin `has_role` en políticas; tablas solo-admin sin lectura sin `is_admin()` |
| G7 | Ningún rol API/plataforma es miembro de otro rol (privilegios heredados) |
| G8 | `sandbox_exec*` sin escritura en Storage; nadie con USAGE en `cron` |

`validation/security/sql/admin-only-tests.sql`: 216 casos con capa esperada explícita (`grant` = privilegio
SQL; `rls` = WITH CHECK; `rows:N` = filtro USING): anon no escribe; no-admin no escribe; admin hace
exactamente lo autorizado; `sandbox_exec*` no escribe ni ejecuta funciones mutadoras; `service_role` solo
el inventario §4 (por columnas); lecturas públicas solo de lo publicado; `is_admin()`/`has_role()`; un solo
admin.

`validation/security/d5/run-d5-simulation.sh` (base desechable, `guard.sh`): mocks de plataforma →
cadena → guarda y pruebas **deben fallar** → D5 → guarda 0 → pruebas → T1–T33 → 9 sondas de regresión
→ idempotencia. Job de CI nuevo `admin-only-db` (stack efímero) + T20/T21 con JWT reales tras D5.

## 9. Resultados de la simulación local (NO oficiales; PostgreSQL 17.11 + `local-shim.sql`)

| Paso | Resultado |
|---|---|
| Guarda antes de D5 | 244 violaciones (G3 196, G4 14, G6 30, G8 4). **Idéntica línea a línea** a la guarda ejecutada en solo lectura sobre producción (`evidence/prod-admin-only-guard.txt`, diff vacío) |
| Pruebas antes de D5 | 102 casos fallan → las pruebas pueden fallar |
| D5 | aplicado en una transacción; huella F0→F1: 208 líneas retiradas, 32 añadidas, **0 líneas `sec_*`** |
| Guarda después | 0 violaciones |
| Pruebas después | 216/216 |
| FND-001 T1–T33 | 186/186; rollback 0 filas |
| Sondas (tabla nueva, política de propietario, política `has_role`, SECURITY DEFINER nueva, EXECUTE indebido, INSERT de sandbox, INSERT en Storage, pertenencia a rol) | 9/9 detectadas |
| Segunda llamada al helper | catálogo byte-idéntico |

## 10. Criterios de aceptación

**Paso 4 (CI, SHA con estos archivos):** jobs `quality`, `fnd001-db` y `admin-only-db` en verde; en
`admin-only-db`: guarda antes > 0, pruebas antes FAIL, guarda después 0, 216/216, 186/186, 9/9 sondas,
idempotencia, T20/T21 con JWT reales verdes.

**Paso 5 (producción, solo tras autorización separada):**
1. Preflight solo lectura: huella de producción idéntica a la CI; guarda = las 244 violaciones conocidas.
2. La SQL de §5 se convierte, sin cambios, en una migración Drizzle; se aplica una vez.
3. Postflight solo lectura: guarda 0 violaciones (2 líneas INFO de `pg_net`); huella = F1 de CI;
   recuentos `user_roles:admin = 1`, contenido no-admin = 0.
4. Prueba manual: la web pública muestra lo publicado; el panel admin sigue funcionando para Adrian;
   las dos funciones del servidor siguen actualizando precios y alertas.
5. Si cualquier punto falla, la migración se revierte con una migración inversa revisada (políticas y
   grants previos están en la huella F0).

**Paso 6 (frontend, después del 5):** guardia de rutas por `rpc('is_admin')` en `/admin`,
`/valuation-engine`, `/quant-matrix`, `/quant/*`; enlaces de administración ocultos a no-admin; sin
«Sign up» visible; registro desactivado en el servidor sin cambios.

## 11. Riesgos y decisiones abiertas

- **D-e `pg_net`**: aceptar el riesgo residual (recomendado: no es vía de datos ni de admin) o pedir a la
  plataforma que retire `net` a `sandbox_exec*`.
- **D-f default ACL**: los default privileges de `postgres` vuelven a conceder INSERT a `sandbox_exec*` y
  escritura a roles API en cada objeto nuevo. Diseño elegido: helper en cada migración + guarda en CI y
  postflight. Alternativa (no incluida): `ALTER DEFAULT PRIVILEGES` del migrador, que la plataforma
  podría restablecer.
- La plataforma podría volver a conceder grants a `sandbox_exec*` en objetos existentes: lo detecta el
  postflight periódico con la guarda.
- Fuera de la base de datos (lo revisas tú): miembros del proyecto Lovable, colaboradores y protección de
  rama en GitHub, 2FA.

## 12. Archivos

| Archivo | Papel |
|---|---|
| `validation/security/d5/d5-admin-only-migration.sql` | SQL propuesto (no en la cadena) |
| `validation/security/d5/run-d5-simulation.sh` | simulación en base desechable |
| `validation/security/sql/admin-only-acl-guard.sql` | guarda (CI + postflight) |
| `validation/security/sql/admin-only-tests.sql` | pruebas de comportamiento |
| `validation/security/sql/d5-platform-mock.sql` | estado de plataforma de producción en la base desechable |
| `validation/security/platform-identity-probe.sql` | consulta de solo lectura de identidades/Storage/net/cron |
| `docs/security/evidence/prod-platform-identity.txt`, `prod-admin-only-guard.txt` | evidencia de producción (solo lectura) |
