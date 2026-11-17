# Navaroli Analysis — Modelo de acceso (público / propietario) y dependencias D-e / D-f

Solo planificación. No se ha modificado código, base de datos, permisos ni configuración.
Estados sin cambio: D5 sin autorización de producción, FND-001 IN PROGRESS, M1.2 NOT STARTED, D-e y D-f OPEN.

Leyenda de evidencia: **[H]** hecho comprobado hoy (lectura de código), **[A]** hecho de la auditoría del 2026-11-12 (`docs/security/admin-only-audit.md`, no revalidado hoy), **[I]** inferencia, **[F]** falta dato.

## 1. Clasificación de capacidades

| Capacidad | Clase | Evidencia y notas |
|---|---|---|
| `/`, `/research`, `/public-thesis/:ticker`, `/thesis/:id`, `/about`, `/contact` | Pública solo lectura | [H] rutas en `src/App.tsx`; [A] RLS solo publicadas para anon |
| Fundamentals SEC (`sec_*`) | Pública solo lectura (lo publicado) | [A] RLS con `sec_is_admin()`; escritura solo RPC/servidor |
| `/volatility`, `/correlation`, `/portfolio`, `/options-pricing`, `/macro`, `/credit-analysis` | Pública interactiva sin persistencia | [H] funciones `fetch-*` sin JWT obligatorio y con límite por IP; [I] cálculo en navegador, sin escritura en BD (ninguna de estas páginas aparece entre los ficheros con `insert/update/delete/rpc`) |
| Búsqueda de equities (cotizaciones, cadenas, FRED) | Pública interactiva sin persistencia | [H] `fetch-stock-data`, `fetch-options-chain`, `fetch-vol-surface`, `fetch-historical-volatility`, `fetch-fred-data` |
| `/admin` (tesis, publicación, page_content, visibilidad Credit, notificaciones, alertas) | Exclusiva propietario | [H] escrituras en `Admin.tsx`, `ThesisFormDialog`, `PublicThesisManager`, `NotificationSettings`, `AlertsList`, `useSiteVisibility`, `usePageContent` |
| `/valuation-engine` (workspaces, exportar tesis, notas, compras) | Exclusiva propietario | [H] escrituras en `ValuationEngine.tsx`, `ExportThesisModal`, `UpdateDataModal`, `AnalystNotebook`, `usePurchases`, `useValuationCache` |
| `/quant-matrix`, `/quant/*` | Decisión pendiente (P1) | [H] `QuantMatrix.tsx` contiene una llamada de escritura/RPC; [A] protegido solo por sesión |
| `update-prices`, `check-thesis-alerts` | Exclusiva propietario / automatización | [H] `x-cron-secret` o JWT + `has_role(admin)` |
| Riesgo: escritura «propietario de fila» en `theses`, `public_thesis_data`, `analysis_workspaces`, `thesis_purchases`, `thesis_alerts`, `profiles` | Riesgo | [A] G1: cualquier cuenta autenticada puede crear y publicar contenido propio; latente porque el registro está desactivado |
| Riesgo: `sandbox_exec*` con INSERT en `public` (incl. `user_roles`) | Riesgo abierto | [A] G2/G3, origen default ACL → D-f |
| Riesgo: `pg_net` con privilegios PUBLIC | Riesgo abierto | [A] D-e, severidad media; comportamiento del worker real NOT RUN (CI 43851494309) |
| Riesgo: frontend comprueba sesión, no rol | Riesgo (cosmético solo) | [A] G4; [F] no revalidado hoy |
| Riesgo: `fetch-*` sin límite para cualquier autenticado | Riesgo bajo (coste) | [H] comentario «authenticated users get unlimited access» |
| Plataforma (editores Lovable, escritores GitHub, protección de `main`) | No verificado | [A] G5; [A] `main` sin protección y Pages puede desplegar antes de `admin-only-db` |

## 2. Modelo mínimo de autorización

1. **Identidad del propietario**: una sola fila `admin` en `public.user_roles` (hoy 1 [A]), garantizada por índice único parcial `WHERE role='admin'`. El rol nunca se deriva de metadatos editables ni del cliente.
2. **Un único predicado**: `public.is_admin()` sin argumentos (STABLE SECURITY DEFINER, `search_path=''`, false sin UID), igual que `sec_is_admin()`. Todas las políticas de escritura usan `is_admin()` en USING y WITH CHECK; lectura pública solo de lo publicado.
3. **Sin escalada**: `user_roles` sin INSERT/UPDATE/DELETE para `anon`/`authenticated` (ni un JWT admin robado añade admins); alta de admin solo por migración revisada; registro de cuentas desactivado (se mantiene); `has_role` sin EXECUTE para `authenticated` tras migrar políticas.
4. **Flags de módulos**: siguen en `page_content` (escritura solo `is_admin()`, lectura pública). Ocultar un módulo es presentación; si un módulo oculto tuviera datos sensibles, su protección debe estar en RLS/servidor, no en el flag.
5. **Funciones del servidor**: lectura externa pública con límite; toda escritura exige `CRON_SECRET` o JWT verificado + `is_admin()`/`has_role` vía `service_role`.
6. **Frontend (defensa secundaria)**: guardia de rutas propietario basada en el rol leído del servidor; enlaces Admin/Sign up ocultos a visitantes. No cuenta como control.
7. **Credenciales técnicas**: `sandbox_exec*` solo SELECT; `service_role` con inventario revisado (D5).

Los pasos 1–3 y 7 son exactamente el contenido de D5 ya diseñado (`docs/security/d5-design.md`); no se propone un modelo nuevo.

## 3. Encaje con D-e y D-f

- **D-f (default ACL / despliegue)** bloquea D5: si la plataforma vuelve a conceder grants por defecto o una migración aplicada fuera de la cadena omite `enforce_privilege_baseline()`, D5 se revierte en silencio. Antes de D5 en producción: decidir mecanismo de migraciones (P3) y armar la comprobación estática + guarda post-migración; proteger `main` y hacer que Pages dependa de `admin-only-db` (P4).
- **D-e (pg_net)** no bloquea D5 en la parte de RLS, pero sí su cierre completo: el vector es `sandbox_exec*`/PUBLIC, no visitantes (la API no expone `net` [A]). Se puede aplicar D5 con D-e documentado como riesgo aceptado temporalmente (P2), o esperar a la mitigación.
- **En paralelo sin riesgo**: guardia de rutas por rol en frontend, pruebas E2E visitante/propietario contra el stack efímero, límite en `fetch-*` para no-admin, decisión sobre `/quant-matrix`.

## 4. Secuencia incremental

| Paso | Contenido | Aceptación |
|---|---|---|
| S0 | Revalidación read-only del catálogo (ya hay script D3) solo si producción cambió desde 2026-11-12 | Conteos coinciden con la auditoría o se documenta la diferencia |
| S1 | Frontend: guardia por rol en `/admin`, `/valuation-engine` (y `/quant-*` según P1); quitar Sign up visible | Visitante y cuenta no-admin son redirigidos; propietario entra |
| S2 | D-f: controles de despliegue (P4) y mecanismo de migraciones (P3) | Push sin `admin-only-db` verde no publica Pages; migración sin baseline falla CI |
| S3 | D5 en stack efímero → CI oficial verde en SHA exacto | Guarda 0 infracciones; suites admin-only y FND-001 verdes; arnés REST verde |
| S4 | D5 en producción (requiere autorización explícita) + postflight read-only | Guarda en producción 0; pruebas negativas REST pasan |
| S5 | D-e: mitigación o aceptación formal | Decisión registrada; worker real verificado o riesgo aceptado |
| S6 | Endurecer `fetch-*` (límite también para no-admin) | Cuenta no-admin limitada; propietario sin límite |

**Pruebas (stack efímero y E2E):**
- Positivas visitante: carga `/research` y una tesis publicada; ejecuta cálculo en `/volatility` con ticker y ventana, obtiene resultado; no se genera ninguna petición de escritura.
- Negativas visitante (anon REST): INSERT/UPDATE/DELETE en `theses`, `public_thesis_data`, `page_content` (incl. flag `credit_public`), `user_roles` → denegado; leer tesis no publicada → 0 filas; invocar `update-prices` → 401.
- Negativas cuenta no-admin: mismas escrituras denegadas; no puede publicar; no puede insertarse `admin`; `/admin` redirige.
- Positivas propietario: crear, editar, publicar, despublicar y borrar tesis; cambiar flag Credit y verlo reflejado para el visitante; ejecutar `update-prices`.
- Escalada: segundo `admin` rechazado por índice único; JWT admin no puede escribir `user_roles` por API.

## 5. Elementos que cambiarían en fases posteriores (no ahora)

- Frontend: `src/App.tsx`, `src/hooks/useAuth.tsx`, `src/components/layout/Header.tsx`, `src/pages/Auth.tsx`, `src/pages/Admin.tsx`, `src/pages/ValuationEngine.tsx`, `src/pages/QuantMatrix.tsx`.
- Funciones: `fetch-stock-data`, `fetch-options-chain`, `fetch-vol-surface`, `fetch-historical-volatility` (límite no-admin); `update-prices`, `check-thesis-alerts` (pasar a `is_admin()` si se retira `has_role`).
- Tablas/políticas: `theses`, `public_thesis_data` (+ vista), `page_content`, `analysis_workspaces`, `thesis_purchases`, `thesis_alerts`, `profiles`, `user_roles`; funciones `is_admin()`, `has_role`, `handle_new_user`, `enforce_privilege_baseline()`.
- Validación/CI: `validation/security/d5/d5-admin-only-migration.sql`, `validation/security/sql/admin-only-acl-guard.sql`, `validation/security/check-baseline-call.sh`, `.github/workflows/quality-checks.yml`, `.github/workflows/deploy-pages.yml`, protección de rama en GitHub.

## 6. Decisiones que requieren tu aprobación

- **P1** `/quant-matrix` y `/quant/*`: ¿públicas solo lectura o exclusivas del propietario? (Recomendado: públicas solo lectura, retirando cualquier escritura.)
- **P2** D-e: ¿aplicar D5 con D-e como riesgo aceptado temporal, o esperar a su mitigación? (Recomendado: aceptar temporalmente; no afecta a visitantes.)
- **P3** D-f migraciones: ¿todas las futuras migraciones solo vía cadena Drizzle con baseline obligatorio, prohibiendo DDL directo del agente? (Recomendado: sí.)
- **P4** Despliegue: ¿activar protección de `main` y que Pages dependa de `admin-only-db`? (Recomendado: sí.)
- **P5** Herramientas públicas: ¿mantener a los visitantes con límite por IP y limitar también a cuentas no-admin? (Recomendado: sí.)
- **P6** Orden: ¿empezar por S1 + S2 en paralelo antes de D5? (Recomendado: sí.)

## Confirmación

Solo se ha hecho planificación con lectura de código y documentación local. Sin cambios en código, base de datos, permisos, flags, commits, workflows ni despliegues.
