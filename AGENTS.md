
- Quant analytics math lives in pure, unit-tested modules under src/lib/<domain>/ behind a common model interface; pages only compose them — keeps models reusable across future quant layers.
- The Quantitative Project Matrix has a single source of truth in src/lib/quant-matrix/ (items, roadmap, selectors); admin status overrides are stored in page_content and merged at runtime — so every matrix view stays consistent without duplicated data.
