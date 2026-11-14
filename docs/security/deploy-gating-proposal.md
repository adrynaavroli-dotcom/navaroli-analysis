# Propuesta: no publicar nada que no haya pasado `quality`, `fnd001-db` y `admin-only-db`

Fecha: 2026-11-14 (UTC). Estado: **PROPUESTA. No aplicada.** No se ha cambiado nada en GitHub ni en la
publicación; `.github/workflows/deploy-pages.yml` sigue igual.

## 1. Situación actual (comprobada en solo lectura vía API pública de GitHub, 2026-11-14)

| Control | Estado |
|---|---|
| `deploy-pages.yml` | Se dispara con `push` a `main` y `workflow_dispatch`, **en paralelo** e independiente de «Quality checks» |
| Prueba real | Commit `dca13189…`: despliegue run `43410417710` terminó a las 10:37:44; `admin-only-db` del run de calidad `43410417697` terminó a las 10:38:50 → **la web se publicó antes de que terminaran las pruebas** (ese día pasaron, pero no era condición) |
| Protección de `main` | `protected: false`; `required_status_checks: off`; 0 rulesets |
| Entorno `github-pages` | Solo regla de rama (`main`); sin revisores obligatorios; `can_admins_bypass: true` |
| Permisos de Actions / acceso de colaboradores / 2FA | **NO VERIFICADO** (la API exige autenticación de administrador) |
| Repositorio | Público |

## 2. Lo que esta propuesta cubre y lo que no

| Vía de publicación | ¿La bloquea esta propuesta? |
|---|---|
| GitHub Pages (`adrynaavroli-dotcom.github.io/navaroli-analysis`) | **Sí**, con el flujo propuesto |
| Publicación de Lovable (`navaroli-analysis.lovable.app`, botón «Publish») | **No**: es independiente de GitHub Actions; depende de que solo tú publiques |
| Migraciones de base de datos | **No**: se aplican desde Lovable directamente a la base real, antes de cualquier CI (ver d5-design.md §11, D-f) |
| Funciones del servidor | **No**: Lovable las despliega al guardarlas |

## 3. Cambios propuestos

**A. Flujo de despliegue (archivo listo: `docs/security/proposals/deploy-pages.gated.yml`).**
- Disparador `workflow_run` de «Quality checks» (`completed`, rama `main`); se eliminan `push` y
  `workflow_dispatch`.
- Job `gate`: exige `conclusion == success`, comprueba por API que los tres jobs (nombres exactos) están en
  `success` y que el SHA sigue siendo la punta de `main`.
- `build` hace checkout de **ese SHA exacto** (`head_sha`), no de la punta en ese momento.
- Toolchain fijada como en calidad (`ubuntu-24.04`, Bun 1.4.4) en lugar de `latest`.

**B. Ajustes de GitHub (los haces tú; no los he tocado).**
1. Entorno `github-pages`: añadir revisor obligatorio (tu cuenta) y desactivar «Allow administrators to
   bypass» si quieres que aplique también a ti; mantener rama `main` como única permitida.
2. Ruleset en `main`: bloquear force-push y borrado de la rama.
3. Required status checks en `main` con los tres jobs: **ojo**, Lovable sube commits directamente a `main`;
   exigir checks antes del push rechazaría esos commits salvo que la app de Lovable figure en la lista de
   bypass. Por eso el control principal es A (gating del despliegue), no la protección de rama.
4. Settings → Actions: permisos por defecto del `GITHUB_TOKEN` en solo lectura; exigir aprobación para
   workflows de forks (repositorio público).
5. Revisar colaboradores y 2FA de la cuenta.

## 4. Verificación tras aplicarlo (cuando lo autorices)

1. Un commit con un fallo provocado en un job → no hay run de despliegue con `gate` en verde.
2. Un commit verde → `gate` lista los tres jobs en `success` y `build` usa el mismo SHA.
3. Lanzar manualmente el despliegue ya no es posible (sin `workflow_dispatch`).
