-- Read-only catalog fingerprint of schema public, used for drift detection between the
-- schema rebuilt from the migration chain and the live project.
-- Only SELECTs on system catalogs; no data rows are read.
-- Platform roles (sandbox_exec_*, supabase_* internals) are filtered out of ACLs because
-- they differ by environment and are not part of the application schema.
-- Output: one sorted line per object; compare two outputs with `diff`.
\pset tuples_only on
\pset format unaligned
WITH
cols AS (
  SELECT format('col|%s.%s|%s|notnull=%s|default=%s', c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
                a.attnotnull, pg_get_expr(d.adbin, d.adrelid)) AS line
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m') AND a.attnum > 0 AND NOT a.attisdropped),
rels AS (
  SELECT format('rel|%s|kind=%s|owner=%s|rls=%s|force=%s', c.relname, c.relkind, c.relowner::regrole,
                c.relrowsecurity, c.relforcerowsecurity) AS line
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S')),
cons AS (
  SELECT format('con|%s|%s|%s', conrelid::regclass, conname, pg_get_constraintdef(oid)) AS line
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace),
idx AS (
  SELECT format('idx|%s', indexdef) AS line FROM pg_indexes WHERE schemaname = 'public'),
pol AS (
  SELECT format('pol|%s|%s|%s|%s|roles=%s|using=%s|check=%s', tablename, policyname, permissive, cmd,
                (SELECT string_agg(r, ',' ORDER BY r) FROM unnest(roles) r), qual, with_check) AS line
  FROM pg_policies WHERE schemaname = 'public'),
trg AS (
  SELECT format('trg|%s', pg_get_triggerdef(t.oid)) AS line
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace),
fn AS (
  SELECT format('fn|%s|owner=%s|secdef=%s|vol=%s|config=%s|src_md5=%s', p.oid::regprocedure, p.proowner::regrole,
                p.prosecdef, p.provolatile, p.proconfig, md5(p.prosrc)) AS line
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace),
vw AS (
  SELECT format('view|%s|def_md5=%s', viewname, md5(definition)) AS line FROM pg_views WHERE schemaname = 'public'),
relacl AS (
  SELECT format('acl|%s|%s|%s', c.relname, CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END,
                x.privilege_type) AS line
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(c.relacl) x
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S')
    AND (x.grantee = 0 OR x.grantee::regrole::text NOT LIKE 'sandbox\_exec%')
    AND (x.grantee = 0 OR x.grantee::regrole::text NOT IN ('supabase_admin','supabase_read_only_user','dashboard_user'))),
fnacl AS (
  SELECT format('fnacl|%s|%s|%s', p.oid::regprocedure, CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END,
                x.privilege_type) AS line
  FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
  WHERE p.pronamespace = 'public'::regnamespace
    AND (x.grantee = 0 OR x.grantee::regrole::text NOT LIKE 'sandbox\_exec%')
    AND (x.grantee = 0 OR x.grantee::regrole::text NOT IN ('supabase_admin','supabase_read_only_user','dashboard_user'))),
enm AS (
  SELECT format('enum|%s|%s', t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)) AS line
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typnamespace = 'public'::regnamespace GROUP BY t.typname)
SELECT line FROM (
  SELECT line FROM cols UNION ALL SELECT line FROM rels UNION ALL SELECT line FROM cons UNION ALL SELECT line FROM idx
  UNION ALL SELECT line FROM pol UNION ALL SELECT line FROM trg UNION ALL SELECT line FROM fn UNION ALL SELECT line FROM vw
  UNION ALL SELECT line FROM relacl UNION ALL SELECT line FROM fnacl UNION ALL SELECT line FROM enm) s
ORDER BY line COLLATE "C";
