-- Transversal security audit (admin-only requirement) — read-only catalog inspection.
-- Answers: what can each identity (anon, authenticated, service_role, sandbox_exec*) do on
-- every public relation/function, which RLS policies decide row access, and which paths
-- could grant admin or modify site content. Only catalog SELECTs and built-in privilege
-- functions; the single non-catalog read is an aggregate COUNT of user_roles by role
-- (no ids, no emails). Run only through validation/fnd001/run-d3-catalog.sh (read-only session).
-- The project-specific platform role is printed as sandbox_exec_<ref>.
\pset footer off
\pset format unaligned
\pset fieldsep '|'

CREATE TEMP VIEW IF NOT EXISTS _x AS SELECT 1; -- fails in read-only mode on purpose? no: temp objects are allowed
