# Investment Analysis - Navaroli

Actúa como un Lead Product Designer y Senior React Developer especializado en aplicaciones Fintech de alto nivel (como Koyfin, Bloomberg o Quartr).

Quiero desarrollar una plataforma web llamada "Investment Analysis".
El objetivo es servir como portfolio profesional para conseguir trabajo en Equity Research.

**Objetivo Central:**
Crear una biblioteca de tesis de inversión altamente organizada, minimalista y fácil de visualizar. La UX debe priorizar la jerarquía de la información: primero los datos clave, luego la profundidad del análisis.

**Stack Tecnológico Obligatorio:**
- Framework: React + Vite + Tailwind CSS.
- UI Library: Shadcn UI (esencial para el look minimalista).
- Base de Datos/Auth: Supabase.
- Gráficos: Recharts.
- Iconos: Lucide React.
- Renderizado de Texto: React-Markdown (para renderizar mis análisis largos generados por IA).

**1. Sistema de Diseño (Design System):**
- **Estilo:** "Swiss International Style" aplicado a finanzas. Mucho espacio en blanco, tipografía sans-serif fuerte (Inter o Geist), bordes sutiles.
- **Paleta:**
  - Fondo: Blanco puro (#ffffff) o Gris muy suave (#f8fafc) para modo claro.
  - Acentos: Slate-900 (Texto principal), Emerald-600 (Buy/Upside), Rose-600 (Sell/Downside), Indigo-600 (Branding).
- **Layout:** Uso de "Bento Grids" (contenedores modulares) para organizar la información de forma visual y ordenada.

**2. Arquitectura de Páginas:**

**A. Landing / Dashboard (Home):**
- *Header:* Logo tipográfico simple "Investment Analysis" a la izquierda. Navegación a la derecha (Thesis, About, Contact).
- *Hero Section:* Título claro: "Institutional-Grade Equity Research". Subtítulo: "Deep dive fundamental analysis combining human insight with AI efficiency."
- *The Grid (Portfolio):* Una tabla o grid de tarjetas interactiva. Cada tarjeta representa una empresa y muestra:
  - Ticker (ej: $AAPL) y Nombre.
  - Sector (Tag coloreado).
  - Tesis (Long/Short).
  - Fecha de análisis.
  - *Sparkline chart:* Un pequeño gráfico de línea mostrando la tendencia del precio (simulado visualmente).
  - Botón "Read Thesis".
- *Sidebar/Filtros:* Capacidad de filtrar por Sector, Market Cap y Estrategia (Value, Growth, Compounder).

**B. Thesis Detail Page (La página clave):**
Esta página debe verse como un reporte PDF interactivo.
- *Sticky Header:* Al hacer scroll, el precio y el ticker se mantienen arriba.
- *Layout de 2 Columnas:*
  - **Columna Izquierda (Key Data - 30%):** "The Fact Sheet". Tabla de métricas (PER, EV/EBITDA, ROIC), Capitalización, Precio Objetivo.
  - **Columna Derecha (Deep Analysis - 70%):** Aquí es donde va el contenido.
    - Usa componentes de acordeón o pestañas para separar: "Executive Summary", "Investment Case", "Valuation", "Risks".
    - El texto debe renderizarse desde Markdown para permitir negritas, listas y citas.
- *Visuals:* Entre el texto, inserta componentes de gráficos grandes y limpios (Revenue Growth, Margins).

**C. Admin Dashboard (CMS Privado):**
- Necesito un panel protegido por login para subir mis análisis.
- **Formulario de Creación:**
  1. Inputs básicos (Ticker, Empresa, Precio, Sector).
  2. Input de "Markdown Content": Un área de texto grande donde pegaré el análisis que redacte con ayuda de mi IA.
  3. Input de "Chart Data": Un campo JSON donde pegaré los datos financieros para que Recharts los pinte automáticamente.

**3. Instrucciones de Comportamiento:**
- La web debe ser **Responsive** (Mobile first).
- Crea datos "dummy" (falsos) realistas de empresas tecnológicas (ej: Nvidia, Airbnb) para poblar la base de datos inicial y visualizar el diseño.
- Implementa "Skeleton loading" para que la carga de datos se sienta premium.

Empieza configurando la base de datos en Supabase y generando la estructura del Dashboard principal con el diseño "Bento Grid".

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://navaroli-analysis.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d5f1434d-e693-437e-9d32-99122a3c7272).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
