psql -v ON_ERROR_STOP=1 -f validation/fnd001/sql/t01_t31.sql      # BEGIN ... ROLLBACK
bunx vitest run validation/fnd001/access.test.ts                   # T20, T21 con JWT reales
bunx vitest run validation/fnd001/ingest.test.ts validation/fnd001/payload.test.ts   # T10, T17, T19, T22-T25, T27b
python3 validation/fnd001/fact_hash.py > /tmp/py.txt && bun validation/fnd001/factHash.ts > /tmp/ts.txt && diff /tmp/py.txt /tmp/ts.txt   # TH
