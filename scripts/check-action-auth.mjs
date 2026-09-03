/**
 * EVERY "use server" EXPORT IS A PUBLIC ENDPOINT.
 *
 *   node scripts/check-action-auth.mjs
 *
 * Rule 1 of this codebase: a server action is reachable by anyone who can guess
 * its id, so it must authorise itself. A control that is merely not rendered is
 * not a permission — the action is reachable without the button.
 *
 * This walks every exported async function in a "use server" file and reports
 * any that never calls authorize(), requirePermission() or requireUser(), and
 * does not delegate to another action in the same file that does.
 *
 * It exists because "I checked and they all looked fine" is not a method, and
 * because the list grows every week.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "lib/actions";
/* currentUser() counts: the profile actions act on the caller and scope every
   write to user.id, refusing when there is no session. That is the right guard
   for "change my own password"; asking for a permission would be the wrong
   question. */
const GUARDS = /\b(authorize|requirePermission|requireUser|currentUser)\s*\(/;

/** Functions that legitimately need no guard, each with the reason. */
const EXEMPT = new Map([
  ["auth.ts:loginAction", "signing in is how you get a session; it cannot need one"],
  ["auth.ts:logoutAction", "ending a session you may not have is harmless"],
  ["quote.ts:estimateQuote", "the public price calculator — reads the rate book, writes nothing"],
  ["requests.ts:submitBooking", "the public booking form. Creates a REQUEST, never a shipment, and no money"],
  ["requests.ts:submitPickup", "the public pickup form. Same: a request a desk still has to accept"],
  ["public-sourcing.ts:submitSourcingEnquiry", "the public sourcing form on the marketing site"],
]);

let checked = 0;
const naked = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".ts"))) {
  const path = join(DIR, file);
  const src = readFileSync(path, "utf8");
  if (!/^\s*["']use server["']/m.test(src)) continue;

  const lines = src.split("\n");

  /*
    Every top-level function in the file, exported or not, with the span of its
    body — because the guard is very often in a small local helper (`actor()`,
    `assertFinance()`) that the actions call. Only counting exported delegates
    reported five rate-book actions as unguarded when every one of them calls a
    local helper that authorises. A checker that cries wolf is worse than none.
  */
  const all = [];
  lines.forEach((l, i) => {
    const m = l.match(/^(?:export )?(?:async )?function (\w+)/);
    if (m) all.push({ name: m[1], line: i, exported: l.startsWith("export") });
  });
  const bodyOf = (idx) => {
    const end = idx + 1 < all.length ? all[idx + 1].line : lines.length;
    return lines.slice(all[idx].line, end).join("\n");
  };
  // Which functions in this file authorise, directly.
  const guards = new Set(
    all.filter((_, i) => GUARDS.test(bodyOf(i))).map((f) => f.name)
  );

  all.forEach((fn, idx) => {
    if (!fn.exported) return;
    const body = bodyOf(idx);
    checked++;
    if (GUARDS.test(body)) return;
    // Delegating to anything in this file that authorises is fine.
    const delegates = [...guards].some(
      (name) => name !== fn.name && new RegExp(`\\b${name}\\s*\\(`).test(body)
    );
    if (delegates) return;
    if (EXEMPT.has(`${file}:${fn.name}`)) return;
    naked.push({ file: path, line: fn.line + 1, name: fn.name });
  });
}

console.log(`${checked} exported server actions checked.`);
if (naked.length === 0) {
  console.log("Every one authorises itself.");
  process.exit(0);
}
console.log(`\n${naked.length} with NO authorisation of their own:\n`);
for (const n of naked) console.log(`  ${n.file}:${n.line}  ${n.name}()`);
process.exit(1);
