# Project rules

- SEC fundamentals (FND-001) live only in `public.sec_*` tables; writes go exclusively through the server-side ingestion function and the `sec_*` run RPCs, never from the browser. Why: append-only provenance and least privilege.
- Admin checks in `sec_*` RLS use `public.sec_is_admin()` (no arguments), not `has_role` directly. Why: anon must not execute `has_role` or probe arbitrary UUIDs.
- `fact_hash` v1 and `raw_json_sha256` must stay byte-identical to `validation/fnd001/hash-vectors.sh`; changing either requires a new hash version. Why: hashes are identity keys.
