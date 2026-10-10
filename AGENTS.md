
- Quant analytics math lives in pure, unit-tested modules under src/lib/<domain>/ behind a common model interface; pages only compose them — keeps models reusable across future quant layers.
- The Quantitative Project Matrix has a single source of truth in src/lib/quant-matrix/ (items, roadmap, selectors); admin status overrides are stored in page_content and merged at runtime — so every matrix view stays consistent without duplicated data.
- All price/return preparation goes through the Returns Engine in src/lib/returns/ (RAW → CLEANED → ADJUSTED → RETURNS, flags never alter data); models consume its returns only — one definition of returns for every downstream model.
- Model validation uses the reusable framework in src/lib/validation/ (plans + ValidationResult evidence, Python reference fixtures, regenerated via validation/run-*.ts); a matrix item's validation layer may be COMPLETED only if its recorded evidence closes its plan, enforced by tests.
- Technical docs live at /quant/* (QuantDoc) and render from the matrix item's docPath plus validation evidence — no duplicated content.
- Covariance/correlation live in src/lib/correlation/ and consume only aligned return panels from the Returns Engine; undefined correlations are null (never NaN/clipped) — keeps every downstream risk/portfolio model on one consistent estimator.
