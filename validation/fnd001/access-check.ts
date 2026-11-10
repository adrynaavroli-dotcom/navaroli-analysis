/**
 * FND-001 / M1.1 — T20 and T21 with REAL JWTs through the REST API.
 *
 * Runs only against the ephemeral Supabase stack started by the CI job `fnd001-db`
 * (or an equivalent local stack). It creates an admin and a non-admin user through
 * the Auth admin API, signs them in to obtain real access tokens, and checks
 * `sec_is_admin()` and the RLS / grant matrix of the sec_* tables for anon,
 * non-admin, admin and service_role.
 *
 * Why a plain Bun script instead of a Vitest file: the default Vitest suite must
 * stay runnable without a database; a missing environment here is a hard failure,
 * never a skip.
 *
 * Required env: FND001_SUPABASE_URL (loopback), FND001_ANON_KEY,
 * FND001_SERVICE_ROLE_KEY, FND001_TEST_DB_URL (loopback, for seeding and role grant).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) { console.error(`not ok - missing ${k} (refusing to skip)`); process.exit(2); }
  return v;
};
const API = env("FND001_SUPABASE_URL");
const ANON = env("FND001_ANON_KEY");
const SERVICE = env("FND001_SERVICE_ROLE_KEY");
const DB = env("FND001_TEST_DB_URL");
// Environment without any ambient libpq PG* variable (the Lovable sandbox exports PG*
// pointing at the live project), so psql can only use the explicit URL below.
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));

// DB target: delegate to lib/guard.sh so the shell scripts and this harness share ONE
// rule (anchored loopback URL + hosted/pooler/project-ref denylist). A local regex here
// would drift from guard.sh; an unanchored one could be bypassed via the query string.
try {
  execFileSync("bash", ["-c", 'source "$1" && fnd001_require_local_db', "fnd001-guard",
    resolve(import.meta.dir, "lib/guard.sh")], { env: { ...cleanEnv, FND001_TEST_DB_URL: DB }, stdio: "inherit" });
} catch {
  console.error("REFUSED: FND001_TEST_DB_URL rejected by lib/guard.sh");
  process.exit(2);
}
// API target: same policy for the REST/Auth endpoint (anchored loopback, same denylist).
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(API) || /zhhagwrgufwamqvjaoip|supabase\.(co|com)|pooler/.test(API)) {
  console.error("REFUSED: access-check only runs against a loopback (ephemeral) stack");
  process.exit(2);
}

/** psql against the guarded ephemeral DB with every ambient PG* variable removed. */
function psql(args: string[]): string {
  return execFileSync("psql", [DB, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", ...args], { env: cleanEnv, encoding: "utf8" });
}

let failures = 0, n = 0;
function check(label: string, ok: boolean, detail = "") {
  n += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "ok" : "not ok"} ${n} - ${label}${ok || !detail ? "" : ` # ${detail}`}`);
}
const client = (token?: string): SupabaseClient =>
  createClient(API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });

async function main() {
  psql(["-f", resolve(import.meta.dir, "sql/access-seed.sql")]);

  const admin = createClient(API, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const password = `T-${crypto.randomUUID()}`;
  const mk = async (email: string) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
    return data.user.id;
  };
  const adminId = await mk("fnd001-admin@example.test");
  await mk("fnd001-user@example.test");
  psql(["-c", `INSERT INTO public.user_roles(user_id, role) VALUES ('${adminId}', 'admin')`]);

  const signIn = async (email: string) => {
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message}`);
    return data.session.access_token;
  };
  const anon = client();
  const user = client(await signIn("fnd001-user@example.test"));
  const adm = client(await signIn("fnd001-admin@example.test"));
  const service = admin;

  // ---- T20 sec_is_admin with real JWTs
  for (const [label, c, want] of [["anon (no UID)", anon, false], ["non-admin", user, false], ["admin", adm, true]] as const) {
    const { data, error } = await c.rpc("sec_is_admin");
    check(`T20 sec_is_admin ${label} -> ${want}`, !error && data === want, error?.message ?? String(data));
  }
  {
    const { error } = await anon.rpc("has_role", { _user_id: adminId, _role: "admin" });
    check("T20 anon cannot execute has_role", error?.code === "42501", error ? `${error.code} ${error.message}` : "no error");
  }

  const ciks = async (c: SupabaseClient) => {
    const { data, error } = await c.from("sec_companies").select("cik").like("cik", "99999999%").order("cik");
    return error ? `ERR:${error.code}` : (data ?? []).map((r) => r.cik).join(",");
  };
  const rows = async (c: SupabaseClient, table: string) => {
    const { data, error } = await c.from(table).select("*").like("cik", "99999999%");
    return error ? `ERR:${error.code}` : String((data ?? []).length);
  };
  const expectDenied = async (label: string, p: PromiseLike<{ error: { code?: string } | null }>) => {
    const { error } = await p;
    check(label, error?.code === "42501", error ? `${error.code}` : "no error");
  };

  // ---- T21 anon
  check("T21 anon sees published company only", (await ciks(anon)) === "9999999901", await ciks(anon));
  {
    const { data, error } = await anon.from("sec_normalized_facts").select("cik,is_current").like("cik", "99999999%");
    check("T21 anon sees only current facts of published company",
      !error && (data ?? []).length === 1 && data![0].cik === "9999999901" && data![0].is_current === true,
      error?.message ?? JSON.stringify(data));
  }
  check("T21 anon sees filings of published company only", (await rows(anon, "sec_filings")) === "1", await rows(anon, "sec_filings"));
  for (const t of ["sec_ingestion_runs", "sec_raw_facts", "sec_raw_fact_observations", "sec_normalized_fact_sources"]) {
    const r = await rows(anon, t);
    check(`T21 anon cannot read ${t}`, r === "ERR:42501", r);
  }
  await expectDenied("T21 anon INSERT company denied", anon.from("sec_companies").insert({ cik: "9999999904", entity_name: "x" }));

  // ---- T21 non-admin
  check("T21 non-admin sees published company only", (await ciks(user)) === "9999999901", await ciks(user));
  for (const t of ["sec_ingestion_runs", "sec_raw_facts", "sec_raw_fact_observations", "sec_normalized_fact_sources"]) {
    const r = await rows(user, t);
    check(`T21 non-admin sees 0 private rows in ${t}`, r === "0", r);
  }
  await expectDenied("T21 non-admin INSERT company denied", user.from("sec_companies").insert({ cik: "9999999904", entity_name: "x" }));

  // ---- T21 admin: reads everything, still no DML
  check("T21 admin sees both companies", (await ciks(adm)) === "9999999901,9999999902", await ciks(adm));
  for (const [t, want] of [["sec_ingestion_runs", "4"], ["sec_raw_facts", "2"], ["sec_raw_fact_observations", "2"],
                           ["sec_normalized_fact_sources", "3"], ["sec_normalized_facts", "3"]] as const) {
    const r = await rows(adm, t);
    check(`T21 admin reads all ${t}`, r === want, `${r} (want ${want})`);
  }
  await expectDenied("T21 admin INSERT company denied", adm.from("sec_companies").insert({ cik: "9999999904", entity_name: "x" }));
  await expectDenied("T21 admin UPDATE company denied", adm.from("sec_companies").update({ is_published: true }).eq("cik", "9999999902"));

  // ---- T21 service_role: INSERT allowed, DELETE / run UPDATE denied
  {
    const { error } = await service.from("sec_companies").insert({ cik: "9999999903", entity_name: "Test C" });
    check("T21 service_role INSERT company OK", !error, error?.message);
  }
  await expectDenied("T21 service_role DELETE company denied", service.from("sec_companies").delete().eq("cik", "9999999903"));
  await expectDenied("T25 service_role UPDATE run status denied",
    service.from("sec_ingestion_runs").update({ status: "completed" }).eq("cik", "9999999901"));

  console.log(`# total=${n} passed=${n - failures} failed=${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`not ok - harness error: ${e instanceof Error ? e.message : e}`); process.exit(1); });
