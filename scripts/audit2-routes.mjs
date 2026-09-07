/**
 * EVERY PAGE IN THE APPLICATION, AS EVERY ROLE — INCLUDING THE ONES WITH AN ID.
 *
 *   node scripts/audit2-routes.mjs
 *
 * The earlier sweep walked the sidebar. This one walks the filesystem: every
 * page.tsx under app/, with each [dynamic] segment filled from a real row, so
 * the detail pages — where most of the work actually happens — are covered
 * too. One question per page: does it throw for somebody.
 */
import { PrismaClient } from "@prisma/client";
const BASE = process.env.BASE ?? "http://localhost:3177";
const PASS = process.env.SEED_ADMIN_PASSWORD ?? "";
const prisma = new PrismaClient();

async function login(email) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const first = r1.headers.getSetCookie?.() ?? [];
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: first.map((c) => c.split(";")[0]).join("; ") },
    body: new URLSearchParams({ csrfToken, email, password: PASS, redirect: "false" }),
  });
  const all = [...first, ...(r2.headers.getSetCookie?.() ?? [])];
  if (!all.some((c) => /session-token/.test(c))) throw new Error("sign-in failed: " + email);
  return all.map((c) => c.split(";")[0]).join("; ");
}

const [shipment, invoice, payment, batch, customer, account, entry, note, ticket, sourcing, user, market, learn, token] =
  await Promise.all([
    prisma.shipment.findFirst({ where: { deletedAt: null }, select: { id: true, trackingNumber: true } }),
    prisma.invoice.findFirst({ select: { id: true } }),
    prisma.payment.findFirst({ select: { id: true } }),
    prisma.batch.findFirst({ select: { id: true } }),
    prisma.customer.findFirst({ select: { id: true } }),
    prisma.companyAccount.findFirst({ select: { id: true } }),
    prisma.ledgerEntry.findFirst({ select: { id: true } }),
    prisma.pickupNote.findFirst({ select: { id: true } }),
    prisma.supportTicket.findFirst({ select: { id: true } }).catch(() => null),
    prisma.sourcingRequest.findFirst({ select: { id: true } }).catch(() => null),
    prisma.user.findFirst({ select: { id: true } }),
    prisma.chinaMarket.findFirst({ select: { slug: true } }).catch(() => null),
    Promise.resolve({ slug: "how-air-cargo-works" }),
    prisma.pickupNote.findFirst({ where: { token: { not: null } }, select: { token: true } }).catch(() => null),
  ]);

/** Every [segment] this app uses, and a real value for it. */
const FILL = {
  "/app/cargo/[id]": shipment?.id,
  "/app/cargo/[id]/edit": shipment?.id,
  "/app/cargo/[id]/label": shipment?.id,
  "/app/receive/[id]/add": batch?.id,
  "/app/batches/[id]/manifest": batch?.id,
  "/app/batches/[id]/stickers": batch?.id,
  "/app/shipments/[id]": batch?.id, /* this route is the batch dashboard, not a consignment */
  "/app/receive/[id]": batch?.id,
  "/app/batches/[id]": batch?.id,
  "/app/finance/batches/[id]": batch?.id,
  "/app/finance/invoices/[id]": invoice?.id,
  "/app/finance/payments/[id]": payment?.id,
  "/app/finance/transactions/[id]": entry?.id,
  "/app/finance/accounts/[id]": account?.id,
  "/app/finance/pickup-notes/[id]": note?.id,
  "/app/customers/[id]": customer?.id,
  "/app/admin/users/[id]": user?.id,
  "/app/support/tickets/[id]": ticket?.id,
  "/app/support/sourcing/[id]": sourcing?.id,
  "/app/collections/record/[invoiceId]": invoice?.id,
  "/(public)/track/[code]": shipment?.trackingNumber,
  "/(public)/t/[token]": token?.token,
  "/(public)/learn/[slug]": learn.slug,
};

const { execSync } = await import("node:child_process");
const files = execSync("find app -name page.tsx", { encoding: "utf8" }).trim().split("\n");
const ROUTES = [];
const skipped = [];
for (const f of files) {
  const key = f.replace(/^app/, "").replace(/\/page\.tsx$/, "") || "/";
  let route = key;
  if (/\[/.test(key)) {
    const value = FILL[key];
    if (!value) { skipped.push(key); continue; }
    route = key.replace(/\[[^\]]+\]/, encodeURIComponent(value));
  }
  ROUTES.push(route.replace("/(public)", "") || "/");
}
ROUTES.sort();

const ROLES = ["ceo", "manager", "finance", "china", "warehouse", "support"];
const broken = [];
let loads = 0;
for (const who of ROLES) {
  const cookie = await login(`${who}@targetexpress.co.tz`);
  let ok = 0, redirect = 0, notFound = 0;
  for (const route of ROUTES) {
    let status;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(BASE + route, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(attempt === 0 ? 25_000 : 90_000) });
        status = res.status;
        if (status !== 500) break;
      } catch { status = "TIMEOUT"; }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    loads += 1;
    if (status === 200) ok += 1;
    else if (status === 307 || status === 302) redirect += 1;
    else if (status === 404) { notFound += 1; broken.push(`${who} ${route} -> 404`); }
    else broken.push(`${who} ${route} -> ${status}`);
  }
  console.log(`${who.padEnd(10)} ${String(ok).padStart(3)} open   ${String(redirect).padStart(3)} redirected   ${String(notFound).padStart(2)} not found`);
}

console.log(`\n${ROUTES.length} routes × ${ROLES.length} roles = ${loads} page loads.`);
if (skipped.length) console.log(`(${skipped.length} dynamic route(s) had no row to fill them: ${skipped.join(", ")})`);
if (broken.length === 0) console.log("No route throws for any role.");
else { console.log(`\n${broken.length} broken:`); for (const b of broken) console.log("  " + b); }
await prisma.$disconnect();
process.exit(broken.filter((b) => !/-> 404$/.test(b)).length === 0 ? 0 : 1);
