/**
 * Every role, against every page it might reach.
 *
 *   node scripts/route-sweep.mjs
 *
 * Not a permission test — a REGRESSION test. It asks one question of every
 * route for every role: does this crash. A 200 or a 307 is a working system; a
 * 500 is a page that throws for somebody, which is the failure a build cannot
 * see and nobody notices until the desk that owns it opens it.
 */
const BASE = process.env.BASE ?? "http://localhost:3177";
const PASS = process.env.SEED_ADMIN_PASSWORD ?? "";

async function login(email) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const first = r1.headers.getSetCookie?.() ?? [];
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded",
               cookie: first.map((c) => c.split(";")[0]).join("; ") },
    body: new URLSearchParams({ csrfToken, email, password: PASS, redirect: "false" }),
  });
  const all = [...first, ...(r2.headers.getSetCookie?.() ?? [])];
  if (!all.some((c) => /session-token/.test(c))) throw new Error("sign-in failed: " + email);
  return all.map((c) => c.split(";")[0]).join("; ");
}

/* Every route the sidebar actually points at, taken from lib/nav.ts, plus the
   handful reached another way. A guessed list finds 404s that are the list's
   fault, not the app's. */
const ROUTES = [
  "/app/admin/audit",
  "/app/admin/deleted",
  "/app/admin/markets",
  "/app/admin/settings",
  "/app/admin/test-data",
  "/app/admin/users",
  "/app/batches",
  "/app/cargo/new",
  "/app/collections/follow-up",
  "/app/customers",
  "/app/dashboard",
  "/app/deliveries",
  "/app/exceptions",
  "/app/finance",
  "/app/finance/accounts",
  "/app/finance/audit",
  "/app/finance/batches",
  "/app/finance/credit",
  "/app/finance/expenses",
  "/app/finance/income",
  "/app/finance/invoices",
  "/app/finance/payments/new",
  "/app/finance/payroll",
  "/app/finance/pickup-notes",
  "/app/finance/pricing",
  "/app/finance/reports",
  "/app/finance/transactions",
  "/app/finance/verify",
  "/app/inventory",
  "/app/manager",
  "/app/manager/approvals",
  "/app/manager/batches",
  "/app/manager/control",
  "/app/manager/finance",
  "/app/manager/operations",
  "/app/manager/payroll",
  "/app/manager/reconciliation",
  "/app/manager/reports",
  "/app/no-access",
  "/app/pickup-queue",
  "/app/profile/settings",
  "/app/receive",
  "/app/release",
  "/app/reports",
  "/app/requests",
  "/app/search",
  "/app/shipments",
  "/app/support",
  "/app/support/markets",
  "/app/support/sourcing",
  "/app/support/tickets",
  "/app/tools/printer",
];
const ROLES = ["ceo", "manager", "finance", "china", "warehouse", "support"];

const broken = [];
for (const who of ROLES) {
  const cookie = await login(`${who}@targetexpress.co.tz`);
  let ok = 0, redirect = 0;
  for (const route of ROUTES) {
    /* Dev compiles a route on its first hit, which can take longer than a
       default fetch will wait — so a miss is retried once, slowly, before it
       counts as a failure. Against a built server the first attempt always
       wins. */
    let status;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(BASE + route, {
          headers: { cookie },
          redirect: "manual",
          signal: AbortSignal.timeout(attempt === 0 ? 20_000 : 90_000),
        });
        status = res.status;
        if (status !== 500) break;
      } catch {
        status = "TIMEOUT";
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    if (status === 200) ok += 1;
    else if (status === 307 || status === 302) redirect += 1;
    else broken.push(`${who} ${route} -> ${status}`);
  }
  console.log(`${who.padEnd(10)} ${String(ok).padStart(2)} open   ${String(redirect).padStart(2)} redirected`);
}

console.log(`\n${ROLES.length * ROUTES.length} page loads across ${ROLES.length} roles.`);
if (broken.length === 0) {
  console.log("No route throws for any role.");
} else {
  console.log(`\n${broken.length} broken:`);
  for (const b of broken) console.log("  " + b);
}
process.exit(broken.length === 0 ? 0 : 1);
