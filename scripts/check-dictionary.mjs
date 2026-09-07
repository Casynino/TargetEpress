/**
 * One key, one entry.
 *
 *   node scripts/check-dictionary.mjs
 *
 * A duplicated key is not a compile error worth hunting by hand — the object
 * literal simply takes the last one and the earlier translation goes quiet. It
 * happened three times in one afternoon of adding entries, so it is asked here
 * instead.
 */
import { readFileSync } from "node:fs";

const src = readFileSync("lib/i18n.ts", "utf8");
const seen = new Map();
const dupes = [];

src.split("\n").forEach((line, i) => {
  const m = /^\s{2}("(?:[^"\\]|\\.)+")\s*:/.exec(line);
  if (!m) return;
  const key = m[1];
  if (seen.has(key)) dupes.push({ key, first: seen.get(key), again: i + 1 });
  else seen.set(key, i + 1);
});

console.log(`${seen.size} dictionary key(s) checked.`);
if (dupes.length === 0) {
  console.log("Every key appears once.");
} else {
  console.log(`\n${dupes.length} duplicated key(s):`);
  for (const d of dupes) console.log(`  ${d.key} — line ${d.first} and line ${d.again}`);
}
process.exit(dupes.length === 0 ? 0 : 1);
