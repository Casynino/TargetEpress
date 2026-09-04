#!/usr/bin/env node
/**
 * The phrases check-i18n cannot see.
 *
 * `t(phrase)` and `t(step.label)` pass a value, not a literal, so the ordinary
 * checker skips them — and behind those call sites sit hundreds of sentences
 * that render to the Guangzhou desk. This walks the files that use a computed
 * key, pulls every string literal out of them, and reports the ones that look
 * like something a person reads and that the dictionary has never heard of.
 *
 * It over-reports by design: a missed translation is invisible, and a false
 * positive costs one glance.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dict = readFileSync(join(root, "lib/i18n.ts"), "utf8");
const known = new Set(
  [...dict.matchAll(/^ {2}"((?:[^"\\]|\\.)*)":/gm)].map((m) =>
    m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  )
);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
})(join(root, "lib"));
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
})(join(root, "components"));
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
})(join(root, "app"));

/** Files that hand a computed value to t(). */
const COMPUTED = /\bt\(\s*(?:locale\s*,\s*)?[A-Za-z_$][\w$]*(?:\.[\w$]+)*\s*[,)]/;

/** A string a person plausibly reads on a screen. */
function userFacing(s) {
  if (s.length < 3 || s.length > 200) return false;
  if (!/[a-z]/.test(s)) return false;
  if (/^[a-z0-9-]+$/.test(s)) return false;
  if (/[<>{}$\\/]|^\/|^https?:|^#|^@/.test(s)) return false;
  return /\s/.test(s) || /^[A-Z][a-z]+$/.test(s);
}

/*
  Where a readable phrase actually lives.

  Not every literal in these files — that is mostly class names and column
  keys. Only the places a phrase is put to be shown: a label-ish property, or
  an argument to one of the small local helpers these files use to build a
  sentence. Narrow on purpose, because a checker that reports four thousand
  lines is one nobody runs twice.
*/
const LABEL_KEYS =
  /\b(label|title|hint|phrase|description|cta|blurb|summary|message|note|text|heading|caption|placeholder|reason|answer|question|one|other|legendIn|legendOut|nextAction|dueText|word|line|step)\s*:\s*("((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)')/g;
const HELPER_CALL =
  /\b(say|count|tell|phrase|line|sentence)\(\s*("((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)')/g;

/*
  Three more places a phrase is translated by value rather than by literal:
  a <PageHeader title="…"> (the component calls t on what it is handed), the
  sidebar rows in lib/nav.ts, and the audit log's action table. All three read
  as ordinary object properties, so nothing else was going to notice them.
*/
const BY_VALUE =
  /(?:<PageHeader[\s\S]{0,800}?\/>)|(?:^\s*"[\w.]+":\s*"[^"\n]+",$)/gm;

const missing = new Map();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const alsoByValue =
    /components\/app\/page-header|lib\/nav\.ts$|lib\/audit-humanise\.ts$/.test(file) ||
    src.includes("<PageHeader");
  if (!COMPUTED.test(src) && !alsoByValue) continue;
  const found = new Set();
  if (alsoByValue) {
    for (const m of src.matchAll(BY_VALUE)) {
      for (const p of m[0].matchAll(
        /\b(?:title|description)=\{?"([^"\n]+)"\}?|^\s*"[\w.]+":\s*"([^"\n]+)",$/gm
      )) {
        const raw = p[1] ?? p[2] ?? "";
        if (userFacing(raw) && !known.has(raw)) found.add(raw);
      }
    }
  }
  for (const re of [LABEL_KEYS, HELPER_CALL]) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      const raw = (m[3] ?? m[4] ?? "").replace(/\\"/g, '"').replace(/\\'/g, "'");
      if (userFacing(raw) && !known.has(raw)) found.add(raw);
    }
  }
  if (found.size) missing.set(file.slice(root.length + 1), found);
}

const only = process.argv[2];
let total = 0;
for (const [file, set] of [...missing].sort()) {
  if (only && !file.includes(only)) continue;
  total += set.size;
  console.log(`\n${file}  (${set.size})`);
  for (const s of [...set].sort()) console.log(`    ${s}`);
}
console.log(
  total === 0
    ? "\nEvery phrase behind a computed key has a translation."
    : `\n${total} phrase(s) with no dictionary entry, in files that translate by value.`
);
