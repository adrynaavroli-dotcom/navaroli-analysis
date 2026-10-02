# Fase 1 — Volatility Analytics (`/volatility`)

Nueva página pública "Volatility Analytics" (subtítulo: *Historical volatility, volatility dynamics and quantitative model comparison*), con el mismo estilo que Options/Macro y enlace "Volatility" en el menú.

## Secciones de la página
1. **Asset / Market Data**: campo de ticker (AAPL, SAN.MC…), periodo (1y/2y/5y), botón Load. Estados de carga, error, ticker inválido, pocos datos y datos vacíos. Resumen de calidad de datos: cuántos precios llegaron, cuántos se descartaron y por qué.
2. **Return Statistics**: nº de observaciones, media diaria, volatilidad diaria y anualizada (con nota de la convención de 252 días), mínimo, máximo, asimetría y curtosis.
3. **Volatility Models**: tabla comparativa (Histórica de toda la muestra, Rolling 20D, Rolling 60D, EWMA) con valor actual y método. Selector de lambda para EWMA (0.90 / 0.94 / 0.97, por defecto 0.94) y la explicación neutral indicada en el brief.
4. **Volatility Dynamics**: gráfico de precio + volatilidad rolling (20/60/120/252D) y un segundo gráfico que superpone realizada |r|·√252, rolling y EWMA para que se vea el agrupamiento de volatilidad (volatility clustering).
5. **Return Distribution**: histograma de retornos logarítmicos con la curva normal de referencia, media, desviación típica, asimetría y curtosis.
6. **Diagnostics**: asimetría, exceso de curtosis, test de Jarque-Bera (H0, estadístico, p-valor, interpretación) al 5% por defecto, con nivel de significación ajustable.
7. **Methodology** (desplegable): fórmulas, supuestos y limitaciones.

Fuera de alcance: GARCH, regímenes, correlación, VaR, carteras y coberturas.

## Detalles técnicos
- **Backend**: reutilizar `fetch-historical-volatility` añadiendo un parámetro opcional `full: true` que devuelve las series completas de `dates[]`/`closes[]` (sin muestreo reducido) y admite `5y`. La respuesta actual no cambia, así que Options sigue funcionando. Se mantienen el mismo rate limit y la misma autenticación. No se crea una función nueva de Yahoo.
- **Motor en `src/lib/volatility/`** (TypeScript puro, sin React):
  - `types.ts`: `PriceSeries`, `ReturnSeries`, `VolatilityResult` y una interfaz `VolatilityModel { id; name; method; calculate(returns, dates) }` pensada para GARCH en el futuro.
  - `returns.ts`: limpieza de datos (precios nulos o no positivos, fechas duplicadas, orden) con un informe de lo descartado, más los retornos logarítmicos.
  - `historical.ts`: volatilidad de toda la muestra con varianza muestral (n-1) × √252.
  - `rolling.ts`: ventana alineada al final, solo con datos pasados (r_{t-n+1}..r_t) y `null` hasta tener n observaciones.
  - `ewma.ts`: σ²_t = λσ²_{t-1} + (1-λ)r²_{t-1}, con semilla explícita (varianza muestral de las primeras 20 observaciones) y sin mirar datos futuros.
  - `statistics.ts`: media, desviación típica, asimetría, curtosis y exceso de curtosis, Jarque-Bera con p-valor de la chi-cuadrado(2) = e^{-JB/2}, e histograma con la densidad normal.
  - `models.ts`: registro de modelos (Historical, Rolling(n), EWMA(λ)).
- **Tests**: Vitest (se añade si no está instalado) en `src/lib/volatility/__tests__/` con ejemplos numéricos conocidos: retornos logarítmicos, anualización, alineación del rolling, inicialización de EWMA y ausencia de datos futuros, asimetría y curtosis frente a valores calculados a mano, y JB.
- **Interfaz**: `src/pages/VolatilityAnalytics.tsx` y componentes en `src/components/volatility/` (StatsGrid, ModelComparison, DynamicsChart, DistributionChart, Diagnostics, Methodology) con Recharts, Card, Tabs y Select de shadcn. Hook `useVolatilityData` con React Query.
- **Rutas y menú**: ruta en `App.tsx` y enlace en los enlaces públicos de `Header.tsx`.
- **Verificación**: Playwright en escritorio y móvil, y comprobación de que `/options-pricing` sigue cargando.
