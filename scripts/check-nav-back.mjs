/**
 * BACK GOES BACK ONE STEP, NOT TWO.
 *
 * The control that renders Back and the effect that records the visit are two
 * effects in one tree, so Back sometimes reads a trail that does not yet know
 * where the reader is. Taking the last-but-one entry of THAT is taking the
 * page before the one they came from — a Back button that skips a level.
 *
 * Both readings have to be right, so both are asserted here.
 */
import { readFileSync } from "node:fs";

const src = readFileSync("lib/nav-trail.ts", "utf8");
const body = src.slice(src.indexOf("export function previousFrom"));
const fn = body.slice(body.indexOf("{"), body.indexOf("\n}") + 2);
const previousFrom = new Function(
  "trail",
  "here",
  `const samePage=(a,b)=>a.split("?")[0]===b.split("?")[0];` +
    fn.replace(/^\{/, "").replace(/\}$/, "")
);

const R = "/app/receive";
const B = "/app/batches/b1";
const S = "/app/shipments/s1";
let bad = 0;
const is = (name, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — got ${got}, wanted ${want}`}`);
};

/* Recorded already: back is the entry before this one. */
is("three deep, trail knows where we are", previousFrom([R, B, S], S), B);
is("two deep, trail knows where we are", previousFrom([R, B], B), R);
is("at the start of the work", previousFrom([R], R), null);

/* Not recorded yet — the stale read that caused the skip. */
is("three deep, trail one step behind", previousFrom([R, B], S), B);
is("two deep, trail one step behind", previousFrom([R], B), R);

/* Nothing to go back to. */
is("no trail at all", previousFrom([], S), null);

/* The query string is not a different page. */
is("same page with a filter on it", previousFrom([R, `${B}?tab=cargo`], B), R);

console.log(bad ? `\n${bad} case(s) wrong.` : "\nBack steps back exactly one page.");
process.exit(bad ? 1 : 0);
