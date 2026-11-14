/**
 * D5 admin-only model — REST integration harness with REAL Auth users and JWTs.
 *
 * Runs only against the ephemeral Supabase stack of the CI job `admin-only-db`, after the
 * D5 proposal has been applied there (never production: the DB URL goes through
 * validation/fnd001/lib/guard.sh and the API URL must be loopback). It creates a synthetic
 * admin and a synthetic non-admin through the Auth admin API, signs both in to obtain
 * real access tokens, and drives PostgREST exactly as the website does, checking:
 *   - is_admin() for anon, non-admin and admin;
 *   - public reads return only published content;
 *   - a non-admin (and anon) cannot create, publish, modify or delete theses, nor change
 *     page_content, profiles or user_roles;
 *   - the admin can do exactly the authorised operations (page_content DELETE and any
 *     user_roles write stay closed on purpose: d5-design.md §3, D-b);
 *   - service_role keeps only the server-function inventory (d5-design.md §4).
 * Each denial states the layer expected to stop it: `grant` (SQL privilege) or `rls`
 * (WITH CHECK); RLS USING filters are asserted as "0 rows affected" plus a direct DB
 * read-back that the row did not change.
 *
 * The number of checks is asserted (EXPECTED_CHECKS): a shrunk run cannot report PASS.
 * Why a plain Bun script and not Vitest: the default Vitest suite must stay runnable
 * without a database; a missing environment here is a hard failure, never a skip.
 *
 * Required env (exported by validation/fnd001/ci/start-stack.sh): FND001_SUPABASE_URL,
 * FND001_ANON_KEY, FND001_SERVICE_ROLE_KEY, FND001_TEST_DB_URL.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const EXPECTED_CHECKS = 68;

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) { console.error(`not ok - missing ${k} (refusing to skip)`); process.exit(2); }
  return v;
};
const API = env("FND001_SUPABASE_URL");
const ANON = env("FND001_ANON_KEY");
const SERVICE = env("FND001_SERVICE_ROLE_KEY");
const DB = env("FND001_TEST_DB_URL");
// No ambient libpq PG* variable (the Lovable sandbox exports PG* for the live project).
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
try {
  execFileSync("bash", ["-c", 'source "$1" && fnd001_require_local_db', "d5-guard",
    resolve(import.meta.dir, "../../fnd001/lib/guard.sh")], { env: { ...cleanEnv, FND001_TEST_DB_URL: DB }, stdio: "inherit" });
} catch {
  console.error("REFUSED: FND001_TEST_DB_URL rejected by lib/guard.sh");
  process.exit(2);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(API) || /zhhagwrgufwamqvjaoip|supabase\.(co|com)|pooler/.test(API)) {
  console.error("REFUSED: the REST harness only runs against a loopback (ephemeral) stack");
  process.exit(2);
}

/** psql as the migrator on the guarded ephemeral DB (seeding and read-backs only). */
const sql = (q: string): string =>
  execFileSync("psql", [DB, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", q], { env: cleanEnv, encoding: "utf8" }).trim();

let failures = 0, n = 0;
function check(label: string, ok: boolean, detail = "") {
  n += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "ok" : "not ok"} ${n} - ${label}${ok || !detail ? "" : ` # ${detail}`}`);
}
const client = (key: string, token?: string): SupabaseClient =>
  createClient(API, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });

type Res = { data: unknown; error: { code?: string; message?: string } | null };
/** Denied by the given layer: grant -> "permission denied ...", rls -> "... row-level security ...". */
async function denied(label: string, p: PromiseLike<Res>, layer: "grant" | "rls") {
  const { error } = await p;
  const ok = error?.code === "42501" &&
    (layer === "grant" ? /^permission denied/.test(error.message ?? "") : /row-level security/.test(error.message ?? ""));
  check(`${label} [${layer}]`, ok, error ? `${error.code} ${error.message}` : "no error");
}
/** No error and exactly `want` rows affected/returned. */
async function rows(label: string, p: PromiseLike<Res>, want: number) {
  const { data, error } = await p;
  const got = Array.isArray(data) ? data.length : -1;
  check(`${label} [rows:${want}]`, !error && got === want, error ? `${error.code} ${error.message}` : `got ${got}`);
}
async function value(label: string, p: PromiseLike<Res>, want: unknown) {
  const { data, error } = await p;
  check(`${label} [= ${JSON.stringify(want)}]`, !error && JSON.stringify(data) === JSON.stringify(want),
    error ? `${error.code} ${error.message}` : JSON.stringify(data));
}

// Fixed synthetic identifiers (prefix d5…), so read-backs are unambiguous.
const T_PUB = "d5000000-0000-4000-8000-000000000001", T_DRF = "d5000000-0000-4000-8000-000000000002",
  T_DEL = "d5000000-0000-4000-8000-000000000003", P_PUB = "d5000000-0000-4000-8000-000000000011",
  P_DRF = "d5000000-0000-4000-8000-000000000012", A_SEED = "d5000000-0000-4000-8000-000000000021";
const TICKERS = ["ZZPUB", "ZZDRF", "ZZDEL", "ZZNEW"];

async function main() {
  const service = client(SERVICE);
  const password = `T-${crypto.randomUUID()}`;
  const mk = async (email: string) => {
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
    return data.user.id;
  };
  const adminId = await mk("d5-admin@example.test");
  const userId = await mk("d5-user@example.test");
  // Admin assignment only by the migrator (D-b); the single-admin index requires removing
  // any admin left by an earlier harness on this disposable stack first.
  sql(`DELETE FROM public.user_roles WHERE role = 'admin'; INSERT INTO public.user_roles (user_id, role) VALUES ('${adminId}', 'admin');
    INSERT INTO public.theses (id, ticker, company_name, sector, current_price, user_id, is_published) VALUES
      ('${T_PUB}', 'ZZPUB', 'Published', 'Tech', 1, '${adminId}', true),
      ('${T_DRF}', 'ZZDRF', 'Draft', 'Tech', 1, '${adminId}', false),
      ('${T_DEL}', 'ZZDEL', 'Draft 2', 'Tech', 1, '${adminId}', false);
    INSERT INTO public.public_thesis_data (id, user_id, ticker, company_name, published_at) VALUES
      ('${P_PUB}', '${adminId}', 'ZZPUB', 'Published', now()), ('${P_DRF}', '${adminId}', 'ZZDRF', 'Draft', NULL);
    INSERT INTO public.page_content (page_key, content) VALUES ('zz_d5_rest', '{"v":0}');
    INSERT INTO public.thesis_alerts (id, thesis_id, user_id, alert_type, ticker, message)
      VALUES ('${A_SEED}', '${P_PUB}', '${adminId}', 'price_drop', 'ZZPUB', 'seed');`);

  const signIn = async (email: string) => {
    const { data, error } = await client(ANON).auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(`signIn ${email}: ${error?.message}`);
    return data.session.access_token;
  };
  const anon = client(ANON);
  const user = client(ANON, await signIn("d5-user@example.test"));
  const adm = client(ANON, await signIn("d5-admin@example.test"));
  const tickers = (c: SupabaseClient, table: string) =>
    c.from(table).select("ticker").in("ticker", TICKERS).order("ticker");

  // ---- is_admin() / has_role()
  await value("F anon rpc is_admin()", anon.rpc("is_admin"), false);
  await value("F non-admin rpc is_admin()", user.rpc("is_admin"), false);
  await value("F admin rpc is_admin()", adm.rpc("is_admin"), true);
  await denied("F service_role rpc is_admin() (not in its inventory)", service.rpc("is_admin"), "grant");
  await denied("F non-admin rpc has_role() (no UUID probing)", user.rpc("has_role", { _user_id: adminId, _role: "admin" }), "grant");
  await value("F service_role rpc has_role() (server functions)", service.rpc("has_role", { _user_id: adminId, _role: "admin" }), true);

  // ---- public reads: published only; admin-only tables closed
  await value("R anon theses", tickers(anon, "theses"), [{ ticker: "ZZPUB" }]);
  await value("R non-admin theses", tickers(user, "theses"), [{ ticker: "ZZPUB" }]);
  await value("R admin theses", tickers(adm, "theses"), [{ ticker: "ZZDEL" }, { ticker: "ZZDRF" }, { ticker: "ZZPUB" }]);
  await value("R anon public_thesis_data_view", tickers(anon, "public_thesis_data_view"), [{ ticker: "ZZPUB" }]);
  await value("R non-admin public_thesis_data", tickers(user, "public_thesis_data"), [{ ticker: "ZZPUB" }]);
  await rows("R anon page_content", anon.from("page_content").select("page_key").eq("page_key", "zz_d5_rest"), 1);
  for (const t of ["analysis_workspaces", "profiles", "user_roles", "thesis_alerts"])
    await denied(`R anon ${t}`, anon.from(t).select("*").limit(1), "grant");
  await rows("R non-admin profiles (own included)", user.from("profiles").select("user_id"), 0);
  await rows("R non-admin user_roles", user.from("user_roles").select("role"), 0);
  await rows("R non-admin thesis_alerts", user.from("thesis_alerts").select("id"), 0);

  // ---- non-admin: no create / publish / modify / delete
  await denied("W non-admin create thesis",
    user.from("theses").insert({ ticker: "ZZNEW", company_name: "x", sector: "Tech", current_price: 1, user_id: userId }), "rls");
  await rows("W non-admin modify published thesis", user.from("theses").update({ company_name: "hacked" }).eq("id", T_PUB).select("id"), 0);
  {
    const { data, error } = await user.from("theses").update({ is_published: true }).eq("id", T_DRF).select("id");
    const still = sql(`SELECT is_published FROM public.theses WHERE id = '${T_DRF}'`);
    check("W non-admin publish draft thesis [rows:0 + still unpublished]", !error && (data ?? []).length === 0 && still === "f",
      error ? `${error.code} ${error.message}` : `rows=${(data ?? []).length} is_published=${still}`);
  }
  {
    const { data, error } = await user.from("theses").delete().eq("id", T_DEL).select("id");
    const left = sql(`SELECT count(*) FROM public.theses WHERE id = '${T_DEL}'`);
    check("W non-admin delete thesis [rows:0 + row kept]", !error && (data ?? []).length === 0 && left === "1",
      error ? `${error.code} ${error.message}` : `rows=${(data ?? []).length} left=${left}`);
  }
  await rows("W non-admin publish thesis data", user.from("public_thesis_data").update({ published_at: new Date().toISOString() }).eq("id", P_DRF).select("id"), 0);
  await denied("W non-admin create thesis data", user.from("public_thesis_data").insert({ user_id: userId, ticker: "ZZNEW", company_name: "x" }), "rls");
  await denied("W non-admin create page_content", user.from("page_content").insert({ page_key: "zz_user", content: {} }), "rls");
  await rows("W non-admin modify page_content", user.from("page_content").update({ content: { v: 9 } }).eq("page_key", "zz_d5_rest").select("page_key"), 0);
  await denied("W non-admin delete page_content", user.from("page_content").delete().eq("page_key", "zz_d5_rest"), "grant");
  await denied("W non-admin create profile", user.from("profiles").insert({ user_id: userId }), "rls");
  await rows("W non-admin modify own profile", user.from("profiles").update({ full_name: "x" }).eq("user_id", userId).select("user_id"), 0);
  await denied("W non-admin self-assign admin", user.from("user_roles").insert({ user_id: userId, role: "admin" }), "grant");
  await denied("W non-admin modify user_roles", user.from("user_roles").update({ role: "user" }).eq("user_id", adminId), "grant");
  await denied("W non-admin delete user_roles", user.from("user_roles").delete().eq("user_id", adminId), "grant");

  // ---- anon: SQL privileges stop every write
  await denied("W anon create thesis", anon.from("theses").insert({ ticker: "ZZNEW", company_name: "x", sector: "Tech", current_price: 1 }), "grant");
  await denied("W anon modify page_content", anon.from("page_content").update({ content: {} }).eq("page_key", "zz_d5_rest"), "grant");
  await denied("W anon self-assign admin", anon.from("user_roles").insert({ user_id: userId, role: "admin" }), "grant");

  // ---- admin: exactly the authorised operations
  await rows("A admin create thesis", adm.from("theses").insert({ ticker: "ZZNEW", company_name: "New", sector: "Tech", current_price: 1, user_id: adminId }).select("id"), 1);
  await rows("A admin modify thesis", adm.from("theses").update({ company_name: "Published v2" }).eq("id", T_PUB).select("id"), 1);
  {
    const { data, error } = await adm.from("theses").update({ is_published: true }).eq("id", T_DRF).select("id");
    const now = sql(`SELECT is_published FROM public.theses WHERE id = '${T_DRF}'`);
    check("A admin publish draft thesis [rows:1 + published]", !error && (data ?? []).length === 1 && now === "t",
      error ? `${error.code} ${error.message}` : `rows=${(data ?? []).length} is_published=${now}`);
  }
  await rows("A admin delete thesis", adm.from("theses").delete().eq("id", T_DEL).select("id"), 1);
  await rows("A admin create thesis data", adm.from("public_thesis_data").insert({ user_id: adminId, ticker: "ZZNEW", company_name: "New" }).select("id"), 1);
  await rows("A admin publish thesis data", adm.from("public_thesis_data").update({ published_at: new Date().toISOString() }).eq("id", P_DRF).select("id"), 1);
  await rows("A admin delete thesis data", adm.from("public_thesis_data").delete().eq("ticker", "ZZNEW").select("id"), 1);
  await rows("A admin create page_content", adm.from("page_content").insert({ page_key: "zz_admin", content: {} }).select("page_key"), 1);
  await rows("A admin modify page_content", adm.from("page_content").update({ content: { v: 1 } }).eq("page_key", "zz_d5_rest").select("page_key"), 1);
  await denied("A admin delete page_content (deliberately closed)", adm.from("page_content").delete().eq("page_key", "zz_admin"), "grant");
  await rows("A admin reads both test profiles", adm.from("profiles").select("user_id").in("user_id", [adminId, userId]), 2);
  await rows("A admin modifies a profile", adm.from("profiles").update({ full_name: "Reviewed" }).eq("user_id", userId).select("user_id"), 1);
  await denied("A admin writes user_roles (D-b: migrator only)", adm.from("user_roles").insert({ user_id: userId, role: "user" }), "grant");
  await value("A admin reads own role only", adm.from("user_roles").select("role"), [{ role: "admin" }]);
  await rows("A admin reads alerts", adm.from("thesis_alerts").select("id").eq("id", A_SEED), 1);
  await rows("A admin creates a workspace", adm.from("analysis_workspaces").insert({ user_id: adminId, ticker: "ZZNEW", company_name: "New" }).select("id"), 1);

  // ---- service_role: only the server-function inventory
  await rows("S service_role update theses price + sparkline (update-prices)",
    service.from("theses").update({ current_price: 2, sparkline_data: [] }).eq("id", T_PUB).select("id"), 1);
  await denied("S service_role update theses.company_name", service.from("theses").update({ company_name: "x" }).eq("id", T_PUB), "grant");
  await denied("S service_role create thesis", service.from("theses").insert({ ticker: "ZZNEW", company_name: "x", sector: "Tech", current_price: 1 }), "grant");
  await denied("S service_role delete thesis", service.from("theses").delete().eq("id", T_PUB), "grant");
  await rows("S service_role update review columns (check-thesis-alerts)",
    service.from("public_thesis_data").update({ last_alert_sent_at: new Date().toISOString(), alert_type: "review", needs_review: true, price_at_last_check: 1 }).eq("id", P_PUB).select("id"), 1);
  await denied("S service_role update public_thesis_data.fair_value", service.from("public_thesis_data").update({ fair_value: 1 }).eq("id", P_PUB), "grant");
  await rows("S service_role create alert", service.from("thesis_alerts").insert({ thesis_id: P_PUB, user_id: adminId, alert_type: "review", ticker: "ZZPUB", message: "probe" }).select("id"), 1);
  await rows("S service_role mark alert email_sent", service.from("thesis_alerts").update({ email_sent: true }).eq("id", A_SEED).select("id"), 1);
  await denied("S service_role update alert message", service.from("thesis_alerts").update({ message: "x" }).eq("id", A_SEED), "grant");
  await denied("S service_role delete alert", service.from("thesis_alerts").delete().eq("id", A_SEED), "grant");
  await denied("S service_role modify page_content", service.from("page_content").update({ content: {} }).eq("page_key", "zz_d5_rest"), "grant");
  await denied("S service_role modify profiles", service.from("profiles").update({ full_name: "x" }).eq("user_id", userId), "grant");
  await rows("S service_role reads notification_email", service.from("profiles").select("notification_email").eq("user_id", adminId), 1);
  await denied("S service_role assign roles", service.from("user_roles").insert({ user_id: userId, role: "admin" }), "grant");
  await denied("S service_role delete roles", service.from("user_roles").delete().eq("user_id", adminId), "grant");

  const admins = sql("SELECT count(*) FROM public.user_roles WHERE role = 'admin'");
  check("U exactly one admin row at the end", admins === "1", admins);

  console.log(`# d5 rest checks: total=${n} passed=${n - failures} failed=${failures} expected=${EXPECTED_CHECKS}`);
  if (n !== EXPECTED_CHECKS) { console.log(`not ok - check count ${n} differs from EXPECTED_CHECKS=${EXPECTED_CHECKS}`); process.exit(1); }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`not ok - harness error: ${e instanceof Error ? e.message : e}`); process.exit(1); });
