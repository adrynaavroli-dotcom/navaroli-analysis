# POR-001 — Minimum Variance Portfolio · Model Design Review (sin implementación)

Skill `quant-model-workflow` activada. Esta ficha es el gate previo a cualquier código: **no se modifica ni crea ningún archivo del proyecto** hasta tu aprobación explícita. Archivos inspeccionados: `src/lib/quant-matrix/data.ts` (POR-001 NOT STARTED, deps DAT-003 + COR-001), `src/lib/correlation/index.ts` y `ewma.ts`, `src/lib/returns/types.ts` (`AlignedPanel`), `src/lib/optim/nelder-mead.ts`, `src/lib/validation/registry.ts` y `suites/vol004.ts` (patrón de evidencia), `src/pages/CorrelationAnalytics.tsx` (patrón de UI).

## 1. Objetivo

Primer motor de optimización de carteras: **Global Minimum Variance (GMV)**. Dado un panel alineado de retornos y una matriz de covarianzas estimada, producir pesos óptimos, riesgo estimado y una evaluación out-of-sample walk-forward frente a una cartera equiponderada. El GMV no usa retornos esperados μ, lo que evita el mayor problema del mean-variance clásico (error de estimación de μ); esa ventaja se documentará explícitamente.

## 2. Dependencias y módulos reutilizados

- **DAT-003** (Returns Engine): única fuente de retornos. Entrada = `AlignedPanel` de log returns diarios (inner join de fechas, sin relleno).
- **COR-001** (`sampleCovariance`, denominador W−1): estimador por defecto.
- **COR-003** (`ewmaCovariance`, λ=0.94): segundo estimador seleccionable; la interfaz acepta cualquier `Matrix` diaria + fecha de estimación, así COR-004 (shrinkage) se enchufa después sin tocar POR-001.
- **TRADING_DAYS=252** de `src/lib/volatility/types` para anualización (varianza ×252, volatilidad √252).
- Framework de validación `src/lib/validation/` (plan + suite + fixture aprobada read-only + runner), mismo ciclo de vida que VOL-003/004/005.
- **No se modifica** ningún módulo validado (`returns/`, `correlation/`, `volatility/`, `optim/`).

## 3. Especificación matemática

**3.1 Sin restricciones (forma cerrada).** min_w wᵀΣw s.t. 1ᵀw = 1 → w\* = Σ⁻¹1 / (1ᵀΣ⁻¹1), σ²_p = 1/(1ᵀΣ⁻¹1). Se resuelve el sistema lineal Σx = 1 (factorización de Cholesky propia, simétrica definida positiva); **nunca** se calcula Σ⁻¹ explícita. Si Cholesky falla (Σ no definida positiva) → estado `SINGULAR`, sin resultado.

**3.2 Long-only con límite por activo.** min_w wᵀΣw s.t. 1ᵀw = 1, 0 ≤ w_i ≤ w_max (w_max por defecto 1.0; exigir w_max ≥ 1/N para factibilidad, validado antes de optimizar). QP convexo sin forma cerrada. Propuesta: **solver active-set propio y determinista** sobre el sistema KKT (N pequeño: 2–6 en UI, tests hasta N=10), con punto inicial factible w₀ = 1/N y verificación KKT final (residuos primal/dual/complementariedad). No se usa Nelder–Mead con penalización: no garantiza factibilidad exacta ni optimalidad. Si el active-set no converge en un número fijo de iteraciones → estado `NOT_CONVERGED` explícito, nunca pesos a medias.

**3.3 Métricas derivadas** (mismo módulo, funciones puras): volatilidad anualizada √(wᵀΣw·252); concentración HHI = Σw² y número efectivo de activos N_eff = 1/HHI; peso máximo; turnover entre rebalanceos Σ|w_t − w_{t−1}| (solo reportado; los costes de transacción son POR-006, fuera de alcance).

**3.4 Walk-forward out-of-sample.** Ventana de estimación rodante de W retornos; rebalanceo cada 21 días de trading; en cada origen se estima Σ solo con datos ≤ origen (sin look-ahead, misma disciplina temporal que VOL-005), se calculan pesos GMV y equal-weight 1/N, y se mide la volatilidad realizada en los 21 días siguientes. Métricas OOS: volatilidad realizada anualizada de cada estrategia, ratio GMV/EW, turnover medio, HHI medio. Sin test de significancia estadística (muestra corta; se reporta como evidencia descriptiva, igual que VOL-005).

## 4. Datos y convenciones

- Retornos log diarios del Returns Engine; frecuencia diaria; anualización ×252/√252.
- Regla de historia mínima: la covarianza muestral exige **W > N** (si W ≤ N, Σ es singular por construcción → estado de error claro, no regularización silenciosa). EWMA exige su semilla de 20 retornos y N ≤ 19 para que la semilla sea definida positiva; ambas reglas se validan antes de optimizar.
- Matrices mal condicionadas: se reporta el número de condición (ratio de autovalores extremos vía potencia iterada, determinista) como diagnóstico; **no** se aplica ridge automático — la reducción de error de estimación es COR-004.
- Procedencia: para la evaluación observada se registrará fuente, fecha de extracción, periodo, divisa y convención de ajuste, como en DAT-001/VOL-005.

## 5. Arquitectura (archivos a crear / modificar)

Crear:
- `src/lib/portfolio/min-variance.ts` — forma cerrada + QP active-set + estados de fallo.
- `src/lib/portfolio/metrics.ts` — HHI, N_eff, turnover, volatilidad de cartera.
- `src/lib/portfolio/walkforward.ts` — motor OOS rodante sin look-ahead.
- `src/lib/portfolio/index.ts`, `src/lib/portfolio/__tests__/` — tests deterministas.
- `src/lib/validation/suites/por001.ts`, `validation/run-por001.ts`, `validation/python/benchmark_por001.py`, `requirements-por001.txt`, fixtures `por001-benchmark.json` (sintética) y evidencia `por001-results.json` + `por001-observed.json`.
- `src/pages/PortfolioOptimization.tsx` (ruta `/portfolio`) y `docs/quant/minimum-variance.md`.

Modificar (solo registro, sin lógica validada): `src/lib/validation/registry.ts` (plan POR-001), `src/lib/quant-matrix/data.ts` (capas/estado), `src/App.tsx` (ruta), `src/components/layout/Header.tsx` (enlace), `.github/workflows/quality-checks.yml` (paso run-por001), `AGENTS.md`, `roadmap.md`.

## 6. Validación y criterios de aceptación

- **Casos analíticos** (tests unitarios): 2 activos con solución hand-computed; Σ diagonal con varianzas iguales → w = 1/N; Σ = σ²I → w = 1/N; presupuesto Σw = 1 con tolerancia 1e-12; factibilidad long-only y w_max; KKT residuos < 1e-10 en el QP.
- **Benchmark independiente Python** (NumPy para la forma cerrada, `scipy.optimize.minimize` SLSQP para el QP; versiones pinneadas): pesos ≤ 1e-10 absoluto en casos interiores; varianza óptima ≤ 1e-12 relativa; el TS nunca puede dar varianza mayor que la referencia − 1e-12. Tolerancias fijadas **antes** de comparar. Fixture aprobada read-only; regenerar exige `--update "<motivo>"`.
- **Estabilidad numérica**: Σ casi singular (correlación 0.999) → o solución estable o estado `SINGULAR`/`ILL_CONDITIONED`, nunca pesos absurdos silenciosos.
- **OOS**: protocolo walk-forward sobre datos observados; pasar significa protocolo cumplido, **no** que GMV supere a equal-weight (se reporta el resultado real, sea cual sea).
- Plan de validación en `registry.ts`: `required: ['unit', 'numerical', 'independent-benchmark', 'out-of-sample']`.
- **No aplica** (justificado): benchmark de convergencia de optimizador tipo arch (el QP es exacto, no un MLE); evaluación QLIKE (no es un modelo de forecast de volatilidad univariante).

## 7. Interfaz (`/portfolio`)

Selector de 2–6 tickers y periodo (patrón de `/correlation`), método de covarianza (Rolling W ∈ {60, 120, 252} / EWMA), w_max por activo; tabla de pesos GMV vs equal-weight con riesgo estimado anualizado, HHI y N_eff; gráfico walk-forward de volatilidad realizada GMV vs EW; distinción visible **in-sample vs out-of-sample**; estados de carga, error, historia insuficiente y no convergencia; disclaimer educativo.

## 8. Alcance: dentro / fuera

**Dentro de POR-001:** GMV sin restricciones + long-only con w_max; métricas de riesgo/concentración/turnover; walk-forward OOS; benchmark Python; UI.
**Fuera:** COR-004 shrinkage (la interfaz ya lo admitirá), POR-002 Max Sharpe (necesita μ), POR-003 frontera eficiente, POR-004 risk parity, POR-005 restricciones generales/grupos, POR-006 costes de transacción (turnover solo se reporta), rebalanceo con drift de pesos entre rebalanceos (se asume rebalanceo exacto a los pesos objetivo).

## 9. Riesgos

- QP active-set propio: riesgo de bugs de cicling → mitigado con regla anti-cicling (Bland) y test de KKT obligatorio.
- Σ muestral ruidosa con W pequeño → GMV extremo; se muestra el número de condición y la limitación en docs/UI.
- OOS con un solo universo de activos y ~2 años → evidencia descriptiva, sin claims de superioridad.

## 10. Criterios de cierre (COMPLETED solo si todo pasa)

Tests unitarios + benchmark Python + runner de evidencia + walk-forward observado ejecutados y en verde; typecheck, lint, build y Quality checks en CI sobre el commit final; browser-check de `/portfolio`; docs y matriz reconciliados (Academic Knowledge permanece PLANNED hasta verificar fuentes del Máster).

## 11. Decisiones que necesitan tu aprobación

- **D1 — Solver QP:** active-set propio determinista (recomendado, sin dependencias nuevas) vs Nelder–Mead con penalización (reutiliza `src/lib/optim/`, pero sin garantías de factibilidad exacta).
- **D2 — Σ mal condicionada:** rechazar con diagnóstico (recomendado; shrinkage es COR-004) vs ridge automático opcional.
- **D3 — Datos OOS observados:** snapshot multi-activo nuevo (p. ej. AAPL/MSFT/SPY/TLT, 2y, misma disciplina de procedencia que DAT-001) vs solo sintético.
- **D4 — UI:** página nueva `/portfolio` (recomendado) vs sección dentro de `/correlation`.
