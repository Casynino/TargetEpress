/**
 * Fail when a string is wrapped for translation but has no translation.
 *
 *   node scripts/check-i18n.mjs           # report and exit non-zero if any
 *   node scripts/check-i18n.mjs --list    # print every one of them
 *
 * This is the one i18n mistake nothing else catches. `t(locale, "Some text")`
 * with no dictionary entry compiles, builds, deploys, and renders the English —
 * so a screen that was "translated" looks untranslated and there is no error
 * anywhere to explain why. It happened here at scale: an agent wrapped 226
 * strings and died before writing their translations, and the only symptom was
 * an owner saying "I still see English".
 *
 * Checked by inverting the usual direction: instead of asking whether the
 * dictionary is used, ask whether everything used is in the dictionary.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LIST = process.argv.includes("--list");

/** Files that render, minus the dictionary itself. */
function sources(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(path) && !path.endsWith("lib/i18n.ts")) out.push(path);
  }
  return out;
}

const dictionary = readFileSync(join(ROOT, "lib/i18n.ts"), "utf8");
const known = new Set(
  [...dictionary.matchAll(/\n\s*"((?:[^"\\]|\\.)*)":/g)].map((m) =>
    m[1].replace(/\\"/g, '"')
  )
);

// t(locale, "…") and the client hook's t("…"), on one line or wrapped.
const CALLS = [
  /\bt\(\s*(?:locale\s*,\s*)?"((?:[^"\\]|\\.)*)"\s*\)/g,
  /\bt\(\s*locale\s*,\s*\n\s*"((?:[^"\\]|\\.)*)"/g,
];

/*
  t() called with something other than a literal — t(label), t(zone.offset),
  t(locale, item.label).

  These are the blind spot. The key is only known at runtime, so this script
  cannot tell whether a translation exists, and a missing one is invisible to
  every check: it compiles, it builds, and it renders English. Two real leaks
  hid here — the timezone captions and a whole row of finance stage labels —
  precisely because a screen full of them still reported zero problems.

  They cannot be resolved automatically, so they are counted and listed rather
  than silently skipped: an unverifiable call is a thing to go and read, not a
  thing to treat as passing.
*/
const DYNAMIC = /\bt\(\s*(?:locale\s*,\s*)?([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\s*\)/g;

const missing = new Map();
const dynamic = new Map();
let wrapped = 0;

for (const file of [...sources(join(ROOT, "app")), ...sources(join(ROOT, "components")), ...sources(join(ROOT, "lib"))]) {
  const src = readFileSync(file, "utf8");
  for (const pattern of CALLS) {
    for (const match of src.matchAll(pattern)) {
      const text = match[1].replace(/\\"/g, '"');
      wrapped++;
      if (!known.has(text)) {
        if (!missing.has(text)) missing.set(text, file.replace(`${ROOT}/`, ""));
      }
    }
  }
  for (const match of src.matchAll(DYNAMIC)) {
    // `t(locale, …)` itself matches the pattern; the locale is not a key.
    if (match[1] === "locale") continue;
    const where = file.replace(`${ROOT}/`, "");
    const key = `${match[1]}  ${where}`;
    if (!dynamic.has(key)) dynamic.set(key, where);
  }
}

console.log(
  `${known.size} translations · ${wrapped} wrapped call sites · ${dynamic.size} computed key(s)`,
);

if (dynamic.size) {
  console.log(
    `\n${dynamic.size} call(s) pass a computed key, so this script cannot verify them.`,
  );
  console.log("Read these by hand — a missing translation here is invisible:");
  const list = LIST ? [...dynamic.keys()] : [...dynamic.keys()].slice(0, 10);
  for (const k of list) console.log(`  t(${k})`);
  if (!LIST && dynamic.size > list.length) {
    console.log(`  … and ${dynamic.size - list.length} more. Re-run with --list.`);
  }
}

if (missing.size === 0) {
  console.log("\nEvery wrapped literal has a translation.");
  process.exit(0);
}

console.log(`\n${missing.size} wrapped string(s) with NO translation — these render in English:`);
const shown = LIST ? [...missing] : [...missing].slice(0, 20);
for (const [text, file] of shown) {
  console.log(`  ${JSON.stringify(text.slice(0, 68))}  ${file}`);
}
if (!LIST && missing.size > shown.length) {
  console.log(`  … and ${missing.size - shown.length} more. Re-run with --list.`);
}
process.exit(1);
