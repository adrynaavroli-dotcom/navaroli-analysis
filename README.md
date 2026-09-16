# Navaroli Analysis

Plataforma de research de inversión: tesis, motor de valoración, pricing de opciones, dashboard macro y análisis de crédito corporativo.

Stack: Vite + React + TypeScript + Tailwind + shadcn/ui + backend gestionado (Supabase).

## Desarrollo

```sh
npm i
npm run dev
```

Variables de entorno necesarias (archivo `.env`, no se sube al repositorio):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PROJECT_ID=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Solo se usan claves públicas (publishable/anon). Nunca añadas claves privadas al repositorio.

## Publicación en GitHub Pages

El repositorio incluye el workflow `.github/workflows/deploy-pages.yml`, que compila y publica
automáticamente en cada push a `main`.

Pasos únicos de configuración en GitHub:

1. Settings → Pages → **Source: GitHub Actions**.
2. Hacer push a `main` (o Actions → *Deploy to GitHub Pages* → *Run workflow*).
3. La web queda en `https://adrynaavroli-dotcom.github.io/navaroli-analysis/`.

Detalles que ya están resueltos:

- `vite.config.ts` usa `base: "/navaroli-analysis/"` cuando la variable `GITHUB_PAGES=true` (solo en el workflow).
- El router usa `basename={import.meta.env.BASE_URL}`, así que las rutas internas funcionan bajo el subdirectorio.
- El workflow copia `index.html` a `404.html` para que las URLs directas (p. ej. `/research`) no den error 404.
- `public/.nojekyll` evita que GitHub Pages ignore archivos generados.

Si cambias el nombre del repositorio, actualiza la ruta en `vite.config.ts`.

## Editar desde GitHub

El proyecto está sincronizado en ambos sentidos con Lovable: los cambios hechos en GitHub
(directamente en la web, en un IDE local o en Codespaces) se reflejan en Lovable y viceversa.

Recomendaciones:

- Trabajar en ramas y abrir Pull Requests para cambios grandes; `main` es lo que se publica.
- Evitar editar a la vez el mismo archivo en Lovable y en GitHub para prevenir conflictos.
- Las funciones de backend viven en `supabase/functions` y no se despliegan desde GitHub Pages;
  Pages sirve únicamente la parte web.

## Hosting alternativo

La web también está publicada en `https://navaroli-analysis.lovable.app`, y admite conectar un
dominio propio, opción más profesional que `github.io` para un portfolio.
