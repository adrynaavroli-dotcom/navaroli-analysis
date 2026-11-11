-- FND-001 / D4 guard (read-only: SELECTs over pg_catalog and privilege functions only).
-- Fails when any role outside the approved set holds a privilege on a public.sec_*
-- object beyond read access. Runs in two places:
--   * CI (disposable stack with simulated platform roles, ci-platform-roles-mock.sql),
--     after the chain is rebuilt — catches a SEC migration that forgot the lockdown call;
--   * production postflight, through run-d3-catalog.sh's read-only session.
--
-- Rules, per sec_* object (relations, sequences, routines):
--   R1 explicit ACL: a grantee that is not the owner and not anon/authenticated/
--      service_role may hold only SELECT on relations/sequences, and only EXECUTE on
--      sec_is_admin(). PUBLIC may hold nothing.
--   R2 effective privilege of every sandbox_exec* role (catches PUBLIC/membership
--      routes and role renames that keep the prefix).
-- API-role ACLs are not judged here: they are pinned by catalog-fingerprint.sql.
-- Output: one "violation|rule|kind|object|grantee|privilege" line per finding, then
-- "summary|violations=<n>". Empty violation list = pass.
\pset tuples_only on
\pset format unaligned
WITH objs AS (
  SELECT 'relation'::text AS kind, c.oid, c.relname::text AS name, c.relkind, c.relowner AS owner,
         c.oid::regclass::text AS label,
         COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, c.relowner)) AS acl
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE 'sec\_%' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
  UNION ALL
  SELECT 'routine', p.oid, p.proname::text, NULL, p.proowner, p.oid::regprocedure::text,
         COALESCE(p.proacl, acldefault('f'::"char", p.proowner))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'sec\_%' AND p.prokind IN ('f', 'p')
),
grants AS (
  SELECT o.*, a.grantee, a.privilege_type,
         CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS grantee_name
  FROM objs o CROSS JOIN LATERAL aclexplode(o.acl) a
),
r1 AS (
  SELECT 'R1'::text AS rule, kind, label, grantee_name AS grantee, privilege_type AS privilege
  FROM grants g
  WHERE g.grantee <> g.owner
    AND g.grantee_name NOT IN ('anon', 'authenticated', 'service_role')
    AND NOT (g.grantee <> 0 AND g.kind = 'relation' AND g.privilege_type = 'SELECT')
    AND NOT (g.grantee <> 0 AND g.kind = 'routine' AND g.name = 'sec_is_admin' AND g.privilege_type = 'EXECUTE')
),
platform AS (SELECT rolname::text FROM pg_roles WHERE rolname ~ '^sandbox_exec(_[a-z0-9]+)?$'),
r2 AS (
  SELECT 'R2'::text, o.kind, o.label, p.rolname, x.priv
  FROM objs o CROSS JOIN platform p
  CROSS JOIN LATERAL unnest(CASE
      WHEN o.kind = 'relation' AND o.relkind = 'S' THEN ARRAY['USAGE', 'UPDATE']
      WHEN o.kind = 'relation' THEN ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
      WHEN o.name <> 'sec_is_admin' THEN ARRAY['EXECUTE']
      ELSE ARRAY[]::text[] END) AS x(priv)
  WHERE CASE
      WHEN o.kind = 'relation' AND o.relkind = 'S' THEN has_sequence_privilege(p.rolname, o.oid, x.priv)
      WHEN o.kind = 'relation' THEN has_table_privilege(p.rolname, o.oid, x.priv)
      ELSE has_function_privilege(p.rolname, o.oid, x.priv) END
),
v AS (SELECT * FROM r1 UNION ALL SELECT * FROM r2)
SELECT line FROM (
  SELECT 0 AS ord, 'violation|' || rule || '|' || kind || '|' || label || '|' || grantee || '|' || privilege AS line FROM v
  UNION ALL
  SELECT 1, 'summary|violations=' || (SELECT count(*) FROM v)
) s ORDER BY ord, line;
