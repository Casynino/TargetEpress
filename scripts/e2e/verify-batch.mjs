/**
 * THE FLIGHT IS ON THE ROW FINANCE VERIFIES.
 *
 * One customer sends on several batches, so two claims of theirs read
 * identically — same name, different consignment — and confirming one meant
 * opening the batch report beside it to see which. The batch belongs on the
 * row. A merged claim can answer bills on more than one flight, and names each
 * of them once.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
const BASE = "http://localhost:3177";
const PW = process.env.SEED_ADMIN_PASSWORD;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prisma = new PrismaClient();
const ok = (m) => console.log(`   ✓ ${m}`);
const bad = (m) => { console.log(`   ✗ ${m}`); process.exitCode = 1; };
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

const pending = await prisma.paymentSubmission.findMany({
  where: { status: "PENDING" },
  select: { submissionNumber: true,
    invoice: { select: { shipment: { select: { batch: { select: { batchNumber: true } } } } } },
    allocations: { select: { invoice: { select: { shipment: { select: { batch: { select: { batchNumber: true } } } } } } } } },
});
if (pending.length === 0) { console.log("no claim is waiting on Finance — nothing to read"); process.exit(0); }
const expected = new Map(pending.map((row) => [row.submissionNumber,
  [...new Set([row.invoice, ...row.allocations.map((a) => a.invoice)]
    .map((i) => i.shipment.batch?.batchNumber).filter(Boolean))]]));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1400 });
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));
await page.goto(`${BASE}/app/finance/verify`, { waitUntil: "networkidle2" });

for (const [number, batches] of expected) {
  const shown = await page.evaluate((n) => {
    const li = document.getElementById(n);
    if (!li) return null;
    const chip = li.querySelector("p.font-medium span.font-mono");
    return { name: li.querySelector("p.font-medium")?.firstChild?.textContent?.trim() ?? "",
      chip: chip ? chip.textContent.trim() : null };
  }, number);
  if (!shown) { bad(`${number} is not on the queue`); continue; }
  const want = batches.join(" · ");
  if (shown.chip === want) ok(`${number} — ${shown.name} · ${shown.chip}`);
  else bad(`${number} shows ${shown.chip === null ? "no batch" : `"${shown.chip}"`}, the bills say "${want}"`);
  /* Named once however many bills it covers: three lines reading GZ-59 three
     times is noise, not an answer. */
  if (shown.chip && shown.chip.split(" · ").length !== new Set(shown.chip.split(" · ")).size)
    bad(`${number} repeats a batch`);
}

await browser.close();
await prisma.$disconnect();
