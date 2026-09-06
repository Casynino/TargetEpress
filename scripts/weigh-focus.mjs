/**
 * Type a whole weight into the Dar box without touching the mouse.
 *
 *   node scripts/weigh-focus.mjs <batchId>
 *
 * The desk reported one digit per click: type 9, land outside the box, click
 * back in, type the next. `Figures` was declared inside VerifyPanel, so every
 * keystroke made a new component type, React rebuilt the subtree and the
 * focused input went with it.
 *
 * Nothing here clicks between characters. If focus is being dropped the box
 * ends up holding one digit instead of five, which is exactly what the
 * warehouse saw.
 */
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "http://localhost:3177";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function cookies(email) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const first = r1.headers.getSetCookie?.() ?? [];
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: first.map((c) => c.split(";")[0]).join("; "),
    },
    body: new URLSearchParams({ csrfToken, email, password: PASSWORD, redirect: "false" }),
  });
  const all = [...first, ...(r2.headers.getSetCookie?.() ?? [])];
  if (!all.some((c) => /session-token/.test(c))) throw new Error(`sign-in failed: ${email}`);
  return all
    .map((c) => {
      const p = c.split(";")[0].trim();
      const i = p.indexOf("=");
      return i > 0 ? { name: p.slice(0, i), value: p.slice(i + 1), url: BASE } : null;
    })
    .filter(Boolean);
}

if (!PASSWORD) throw new Error("SEED_ADMIN_PASSWORD is not set.");
const batchId = process.argv[2];
if (!batchId) throw new Error("Pass the batch id: node scripts/weigh-focus.mjs <batchId>");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));
await page.goto(`${BASE}/app/receive/${batchId}`, { waitUntil: "networkidle0" });

// The scales icon, found by the title a person would hover to read.
const opened = await page.evaluate(() => {
  const hit = [...document.querySelectorAll("button")].find(
    (b) => (b.getAttribute("title") ?? "") === "Correct the weight"
  );
  if (!hit) return false;
  hit.click();
  return true;
});
if (!opened) throw new Error('No "Correct the weight" button on this page.');

const sel = 'input[name="weightKg"]';
await page.waitForSelector(sel, { timeout: 10000 });

// One click. Everything after this is keyboard only.
await page.click(sel);
await page.evaluate((s) => document.querySelector(s).select(), sel);

const WANT = "12.34";
await page.keyboard.type(WANT, { delay: 60 });

const typed = await page.evaluate((s) => {
  const el = document.querySelector(s);
  return { value: el.value, focused: document.activeElement === el };
}, sel);

await page.keyboard.press("Backspace");
await page.keyboard.press("Backspace");

const erased = await page.evaluate((s) => {
  const el = document.querySelector(s);
  return { value: el.value, focused: document.activeElement === el };
}, sel);

await browser.close();

console.log(`typed "${WANT}"          -> box holds "${typed.value}"  focused: ${typed.focused}`);
console.log(`then two backspaces   -> box holds "${erased.value}"  focused: ${erased.focused}`);

const ok =
  typed.value === WANT && typed.focused && erased.value === "12." && erased.focused;
console.log(ok ? "\nPASS — one click, then the whole number typed and erased" : "\nFAIL");
process.exit(ok ? 0 : 1);
