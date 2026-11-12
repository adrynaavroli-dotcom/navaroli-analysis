# Auditoría transversal de permisos — requisito «administración exclusiva»

Fecha: 2026-11-12 (UTC). Estado: **AUDITORÍA COMPLETADA, MODELO OBJETIVO PENDIENTE DE APROBACIÓN.**
Nada de este documento se ha aplicado. No se ha ejecutado DDL/DML, ni D4, ni D5, ni M1.2.

## 0. Requisito (permanente)

La web es pública en lectura del contenido publicado. Solo la identidad administradora (Adrian)
crea, modifica, elimina, publica o retira contenido, cambia configuración, gestiona el panel y
accede al backend y backups. Nadie puede auto-asignarse `admin`. Automatizaciones y credenciales
técnicas: mínimo privilegio, nunca administradoras. Se aplica en PostgreSQL/RLS, funciones del
servidor y frontend; ocultar elementos de la interfaz no cuenta como control.

## 1. Método y evidencia

| Fuente | Cómo | Evidencia |
|---|---|---|
| Catálogo de producción | `validation/fnd001/run-d3-catalog.sh` (sesión forzada `default_transaction_read_only=on`) ejecutando `validation/security/permissions-audit.sql` | `docs/security/evidence/prod-permissions-audit.txt` |
| Datos | Solo `COUNT` agregados (E5, E6); ningún id, email ni fila de negocio | mismo archivo, §E5–E6 |
| Configuración de Auth | `GET /auth/v1/settings` público (clave publicable), solo lectura | resultado citado en §3 |
| Funciones del servidor | Lectura de `supabase/functions/*/index.ts` y `supabase/config.toml` | código |
| Frontend | Lectura de `src/App.tsx`, `useAuth.tsx`, `Header.tsx`, `Admin.tsx`, `Auth.tsx` | código |
| CI | API pública de GitHub | run 43034468790 |

Notas: `has_table_privilege` muestra privilegios de objeto; el acceso real a `auth`/`cron` requiere
además USAGE sobre el esquema (§D1 de la evidencia). La API REST solo expone `public` (y
`graphql_public`); `anon`/`authenticated` no ejecutan SQL arbitrario.

**NO VERIFICADO desde aquí:** número total de cuentas en `auth.users` (la sesión de auditoría no
tiene USAGE en `auth`; `profiles` = 1 como aproximación), comando de los cron jobs (sin USAGE en
`cron`), miembros del workspace/proyecto Lovable, colaboradores y protección de ramas en GitHub,
2FA de las cuentas, acceso a backups (gestionados por Lovable Cloud, no visibles como rol de BD).

## 2. Identidades

| Identidad | Quién la usa | Atributos (A1) |
|---|---|---|
| `anon` | Cualquier visitante vía API REST con la clave publicable | sin login, sin BYPASSRLS |
| `authenticated` (no admin) | Cualquier cuenta con sesión | sin BYPASSRLS; RLS decide |
| `authenticated` + fila `admin` | Adrian (E5: **1** fila `admin`; E6: **1** perfil, 0 no-admin) | igual que arriba + políticas `has_role` |
| `service_role` | Funciones del servidor (`update-prices`, `check-thesis-alerts`) | BYPASSRLS, sin login directo; clave solo en secretos del servidor |
| `sandbox_exec`, `sandbox_exec_<ref>` | Sesiones técnicas del agente de Lovable en este proyecto | **LOGIN + BYPASSRLS** |
| Plataforma | Editores del proyecto Lovable, escritura en GitHub | fuera de PostgreSQL (§5) |

`authenticator` solo puede actuar como `anon`/`authenticated`/`service_role` (A2); ningún rol de la
API puede convertirse en `sandbox_exec*`.

## 3. Matriz de permisos — estado actual vs objetivo

Leyenda: R lectura, C crear, U modificar, D borrar, P publicar/retirar. «propio» = filas con
`user_id = auth.uid()`. Efectivo = grants ∩ RLS (o grants solos para roles BYPASSRLS).

| Objeto | anon | authenticated no-admin | admin | service_role | sandbox_exec* | Objetivo |
|---|---|---|---|---|---|---|
| `theses` | R publicadas | R publicadas; **C/U/D/P propias** | igual que no-admin (solo propias) | todo | R todo + **C (puede insertar publicada)** | anon/auth: R publicadas; escritura solo admin; sandbox solo R |
| `public_thesis_data` (+ vista) | R publicadas (columnas públicas) | R publicadas; **C/U/D/P propias** | ídem | todo | R + **C** | ídem |
| `page_content` (incl. visibilidad de secciones) | R | R | R, C, U | todo | R + **C** (nuevas claves) | escritura solo admin; sandbox solo R |
| `analysis_workspaces` | — | **C/R/U/D propias** | ídem | todo | R + C | solo admin |
| `thesis_purchases` | — | **C/R/U/D propias** sobre tesis publicadas | ídem | todo | R + C | solo admin |
| `thesis_alerts` | — | R/U/D propias | ídem | todo (crea alertas) | R + C | R/U solo admin; C solo servicio |
| `profiles` | — | R/U propia; C propia | ídem | todo | R + C | solo admin (o propia, ver D-c) |
| `user_roles` | — | R propia; **no** C/U/D (C exige `has_role admin`; no hay política UPDATE) | R todo, C, D | todo | R todo + **C (D3 confirmado)** | nadie vía API; asignación solo por migración revisada |
| `sec_*` (8 tablas) | R publicadas | R publicadas | R todo | C (+U en runs/normalized) | R + **C** (D4) | sin cambio salvo D4 |
| Storage | 0 buckets, 0 políticas → nada | nada | nada | todo | C en `storage.buckets/objects` (metadatos) | sin buckets; sandbox sin escritura |
| `has_role(uuid,…)` | no | **EXECUTE** (consulta si cualquier UUID es admin) | EXECUTE | EXECUTE | EXECUTE (sufijo) | solo `service_role`; políticas con helper sin argumentos |
| `sec_is_admin()` | EXECUTE (devuelve false) | EXECUTE | EXECUTE | — | EXECUTE (sufijo) | sin cambio |
| RPC `sec_*` de corridas | no | no | no | EXECUTE | EXECUTE (sufijo) | D4 |
| `cron.schedule`, `net.http_post` | EXECUTE en función, pero sin USAGE en `cron`; `net` no expuesto por la API | ídem | ídem | ídem | ídem | higiene, no vía real |
| TRUNCATE en tablas `public` | grant presente; no invocable vía API | ídem | ídem | sí | no | revocar (defensa en profundidad) |
| Funciones del servidor de escritura | 401 | 401 | OK (JWT + `has_role`) | — | — | sin cambio |
| Funciones `fetch-*` (solo lectura externa) | con límite por IP | sin límite | sin límite | — | — | sin cambio |
| Registro de cuentas | `disable_signup = true` (confirmado); proveedor solo email | — | — | — | — | mantener desactivado |
| Frontend `/admin`, `/valuation-engine`, `/quant-matrix`, `/quant/*` | redirige a login | **acceso concedido (solo comprueba sesión, no rol)**; enlace Admin visible | acceso | — | — | guardia por rol comprobado en servidor; quitar «Sign up» |

## 4. Vías encontradas (por gravedad)

| ID | Vía | Hoy | Por qué |
|---|---|---|---|
| G1 | Cualquier cuenta no-admin puede crear y **publicar** tesis (`theses.is_published`, `public_thesis_data.published_at`) que aparecen en la web pública, y usar el panel `/admin` | **Latente**: no explotable hoy porque el registro está desactivado y solo existe 1 perfil (admin) | RLS usa «propietario», no «admin». Una cuenta creada por invitación, reactivación del registro o error de configuración bastaría |
| G2 | Credenciales `sandbox_exec*` pueden **insertar `admin` en `user_roles`** para cualquier usuario existente (FK a `auth.users`), saltándose RLS | **Abierta** (D3 confirmado hoy) | Grants por defecto de la plataforma (INSERT en todas las tablas `public`) + BYPASSRLS. Quien controle el agente de este proyecto puede usarla |
| G3 | `sandbox_exec*` puede insertar contenido directamente en `theses`, `public_thesis_data`, `page_content` (p. ej. una tesis publicada o una clave de visibilidad nueva) | Abierta | Mismo origen que G2 |
| G4 | Frontend: rutas y enlace Admin se basan en «hay sesión», no en el rol | Abierta (cosmética, sin efecto en datos por sí sola) | Incumple el punto 7 si G1 se activa |
| G5 | Plataforma: cualquier editor del proyecto Lovable controla el agente (migraciones, sesiones, secretos); cualquier escritor del repositorio GitHub (público) despliega código | **NO VERIFICADO** | Depende de miembros del workspace y colaboradores de GitHub |
| G6 | `authenticated` puede ejecutar `has_role(uuid, …)` y averiguar qué UUID es admin | Abierta, baja | Fuga de información, no escalada |
| G7 | TRUNCATE/REFERENCES/TRIGGER concedidos a `anon`/`authenticated`; `net.http_post`/`cron.schedule` con EXECUTE | Higiene | No alcanzables vía API REST hoy; conviene cerrarlos por si se expone otro esquema |
| G8 | `service_role` es superpoder de Supabase (BYPASSRLS) | Por diseño | Mitigado: clave solo en el servidor; funciones exigen `CRON_SECRET` o JWT admin |

Comprobado sin hallazgo: `user_roles` tiene `UNIQUE(user_id, role)`, sin política UPDATE, INSERT
requiere admin; `handle_new_user` solo crea el perfil (no asigna rol) y no es ejecutable por la API;
`sandbox_exec*` no tiene USAGE en `auth`, `vault` ni `cron`; ningún rol puede CREATE en `public`;
todas las tablas `public` son propiedad de `postgres` con RLS activo; 0 contenidos de no-admin (E6).

## 5. Modelo objetivo propuesto (no aplicado)

1. **BD — contenido y configuración solo admin.** Helper `public.is_admin()` sin argumentos (mismo
   patrón que `sec_is_admin()`: STABLE SECURITY DEFINER, `search_path=''`, false sin UID). Sustituir
   todas las políticas de escritura «propietario» de `theses`, `public_thesis_data`,
   `analysis_workspaces`, `thesis_purchases`, `thesis_alerts`, `profiles`, `page_content` por
   políticas `is_admin()` en USING y WITH CHECK. Lectura pública solo de lo publicado.
2. **BD — `user_roles` fuera de la API.** Revocar INSERT/UPDATE/DELETE a `anon` y `authenticated`
   (ni siquiera un JWT admin robado añade administradores); lectura solo de la fila propia.
   Revocar EXECUTE de `has_role` a `authenticated` tras migrar las políticas (G6); las funciones
   del servidor siguen usándola con `service_role`.
3. **BD — higiene (G7).** Revocar TRUNCATE, REFERENCES y TRIGGER de `anon`/`authenticated` en
   `public`.
4. **D5 — credenciales técnicas (G2/G3).** Generalizar D4 a todo `public`: `sandbox_exec*` solo
   SELECT, sin EXECUTE salvo helpers de lectura. Riesgo a confirmar: la plataforma podría volver a
   conceder esos grants (default ACL); por eso la guarda de §5.7 debe detectarlo.
5. **Funciones del servidor.** Mantener el patrón actual (`CRON_SECRET` o JWT + rol admin). Regla
   para nuevas funciones (incluida la ingesta SEC de M1.2): toda escritura exige esa verificación;
   `service_role` solo dentro de la función, nunca en el navegador.
6. **Frontend (capa cosmética).** Guardia `AdminRoute` que consulta el rol en el servidor; ocultar
   enlaces de administración a no-admin; quitar «Sign up» de la pantalla de acceso.
7. **Guarda de regresión en CI.** Extender `sec-platform-acl-guard.sql` a todo `public`: falla si
   algún rol distinto de `postgres`/`service_role` puede escribir, o si una política de escritura no
   pasa por `is_admin()`.
8. **Plataforma (lo haces tú).** Revisar miembros del workspace Lovable y sus roles, colaboradores y
   protección de la rama principal en GitHub, y 2FA en Lovable, GitHub y el correo de acceso.

### Decisiones abiertas

- **D-a** Alcance de D5: (i) solo `user_roles`, (ii) todo `public` (recomendado por el requisito 6).
- **D-b** `user_roles`: sin escritura vía API (recomendado) o escritura solo admin vía API.
- **D-c** `profiles`: solo admin, o cada cuenta su propio perfil (hoy solo existe el tuyo).
- **D-d** Orden: BD (1–4) en una migración revisada + simulación local, luego frontend (6) y guarda CI (7).

## 6. CI pendiente cerrado en esta auditoría

Quality checks run 43034468790 sobre `66abcef119c8a631f358ea364442d1f7f6833fe1` (commit que fija
las versiones): `success`; jobs `quality` y `fnd001-db` en `ubuntu-24.04`, todos los pasos en verde
(TypeScript, Vitest, VOL-003/004/005, POR-001, hash vectors, build; cadena de migraciones, stack
efímero, T1–T33, T20/T21 JWT, evidencia).
https://github.com/adrynaavroli-dotcom/navaroli-analysis/actions/runs/43034468790
