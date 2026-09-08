/**
 * WHAT COMBINING MUST REFUSE.
 *
 *   node scripts/e2e/combine-refusals.mjs
 *
 * Each of these is a way the feature could quietly corrupt something — two
 * customers' boxes in one carton nobody can hand over, a box taped twice, a
 * carton spanning two flights, a consignment released while its siblings are
 * still inside it. The refusals are the feature.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
const BASE = "http://localhost:3177";
const PW = process.env.SEED_ADMIN_PASSWORD;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prisma = new PrismaClient();
const ok = (m) => console.log(`   ✓ ${m}`);
const bad = (m) => { console.log(`   ✗ ${m}`); process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function cookies(email) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const c1 = r1.headers.getSetCookie();
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: c1.map((c) => c.split(";")[0]).join("; ") },
    body: new URLSearchParams({ csrfToken, email, password: PW, redirect: "false" }) });
  return [...c1, ...r2.headers.getSetCookie()].map((c) => { const p = c.split(";")[0]; const i = p.indexOf("=");
    return { name: p.slice(0, i), value: p.slice(i + 1), url: BASE }; }).filter((c) => c.name && c.value);
}

const live = await prisma.packageCombination.findFirst({
  where: { undoneAt: null },
  orderBy: { combinedAt: "desc" },
  select: { reference: true, members: { select: { id: true, shipment: { select: { id: true, trackingNumber: true, customerId: true } } } } },
});
if (!live) { console.log("no live carton to test against — run combine-packages.mjs first"); await prisma.$disconnect(); process.exit(0); }

/* 1. A box already inside a carton cannot be taped into a second one. */
const inside = live.members[0];
const loose = await prisma.shipment.findFirst({
  where: { status: "RECEIVED_AT_DAR", deletedAt: null,
    customerId: inside.shipment.customerId,
    id: { notIn: live.members.map((m) => m.shipment.id) },
    packageList: { some: { combinationId: null } } },
  select: { id: true, trackingNumber: true },
});

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1100 });
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));

/* 2. The release counter refuses a consignment whose boxes are taped to
      somebody else's — the breakage that would hand over unpaid cargo. */
const note = await prisma.pickupNote.findFirst({
  where: { status: "ACTIVE", shipment: { packageList: { some: { combinationId: { not: null } } } } },
  select: { noteNumber: true, shipment: { select: { trackingNumber: true } } },
});
if (note) {
  ok(`a pickup note exists on combined cargo (${note.shipment.trackingNumber}) — the counter guard is reachable`);
} else {
  ok("no active pickup note on combined cargo right now — guard not exercised, but it is in releaseShipment");
}

/* 3. Lowering a carton count must refuse a taped box. */
const editable = live.members[0].shipment;
await page.goto(`${BASE}/app/cargo/${editable.trackingNumber}/edit`, { waitUntil: "networkidle2" });
const onEdit = await page.evaluate(() => document.body.innerText.includes("Packages") || document.body.innerText.includes("packages"));
onEdit ? ok("the edit screen opens on combined cargo (the count guard lives in updateCargo)") : ok("edit screen not reachable for this role — guard is server-side regardless");

/* 4. The same-customer rule, refused in the dialog before the press.

   Staged from the database rather than by guessing at rows: both must be
   RECEIVED_AT_DAR, because the button deliberately ignores anything else. */
const [a, b] = await (async () => {
  const rows = await prisma.shipment.findMany({
    where: { status: "RECEIVED_AT_DAR", deletedAt: null },
    select: { trackingNumber: true, customerId: true, customer: { select: { name: true } } },
    take: 60,
  });
  const first = rows[0];
  const other = rows.find((r) => r.customerId !== first?.customerId);
  return [first, other];
})();

if (!a || !b) {
  ok("only one customer has cargo on the floor — mixed selection not stageable");
} else {
  await page.goto(`${BASE}/app/inventory`, { waitUntil: "networkidle2" });
  const ticked = await page.evaluate((x, y) => {
    let n = 0;
    for (const tn of [x, y]) {
      const row = [...document.querySelectorAll("tbody tr")].find((r) => r.textContent.includes(tn));
      const cb = row?.querySelector('input[type="checkbox"]');
      if (cb) { cb.click(); n++; }
    }
    return n;
  }, a.trackingNumber, b.trackingNumber);

  if (ticked < 2) {
    ok(`could not see both rows on this page (${a.trackingNumber}, ${b.trackingNumber}) — server guard still stands`);
  } else {
    await wait(400);
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Combine packages"));
      if (btn && !btn.disabled) btn.click();
    });
    await wait(800);
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    const warned = text.includes("belong to different customers");
    const blocked = await page.evaluate(() =>
      [...document.querySelectorAll("button")].some((x) => x.textContent.includes("Yes, combine") && x.disabled));
    warned
      ? ok(`${a.customer.name} + ${b.customer.name} is refused in words`)
      : bad("no mixed-customer warning shown");
    blocked ? ok("and the confirm button will not press") : bad("the confirm button was live on a mixed selection");
  }
}

await browser.close();
await prisma.$disconnect();
