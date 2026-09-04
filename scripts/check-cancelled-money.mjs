#!/usr/bin/env node
/**
 * A cancelled transaction must never be counted as money that moved.
 *
 * The register is append-only: cancelling something leaves the original line
 * and adds a reversing one pointing at it. A total that NETS — sum of IN minus
 * sum of OUT, or a running balance — is fine, because the pair cancels itself.
 * A total that reports IN and OUT SEPARATELY is not: cancelling an income of
 * 54 adds 54 to "money out", because the reversal is an OUT line. That is the
 * bug this exists to stop coming back.
 *
 * So: any ledgerEntry read that groups or filters BY DIRECTION has to exclude
 * both halves of a reversed pair — `reversesId: null` AND
 * `reversedBy: { is: null }` — or net the two directions against each other.
 *
 * It reports what it cannot judge rather than staying quiet, because a total
 * this script waved through is a total nobody looks at again.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const files = [];
for (const dir of ["app", "lib", "components"]) {
  (function walk(d) {
    for (const name of readdirSync(d)) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(full);
    }
  })(join(root, dir));
}

/** A ledgerEntry read, from the call through to its closing brace. */
function reads(src) {
  const out = [];
  const re = /prisma\.ledgerEntry\.(groupBy|aggregate|findMany|count)\s*\(/g;
  for (const m of re.exec_all ? [] : [...src.matchAll(re)]) {
    let i = m.index + m[0].length - 1;
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({
      op: m[1],
      body: src.slice(start, i + 1),
      line: src.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

let flagged = 0;
let checked = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("prisma.ledgerEntry.")) continue;
  for (const r of reads(src)) {
    /* Only reads that split the money by direction can get this wrong. A
       findMany or count is a list or a tally, not a total. */
    const splitsByDirection =
      /by:\s*\[[^\]]*["']direction["']/.test(r.body) ||
      /direction:\s*["'](IN|OUT)["']/.test(r.body);
    if (!splitsByDirection) continue;
    checked++;

    const excludesBoth =
      /reversesId:\s*null/.test(r.body) && /reversedBy:\s*\{\s*is:\s*null/.test(r.body);
    /* Grouping by direction WITHOUT filtering one is the netting shape: the
       caller gets both directions and is expected to subtract. */
    const groupsBothDirections =
      /by:\s*\[[^\]]*["']direction["']/.test(r.body) &&
      !/direction:\s*["'](IN|OUT)["']/.test(r.body);

    if (excludesBoth || groupsBothDirections) continue;

    flagged++;
    console.log(
      `\n${file.slice(root.length + 1)}:${r.line}  prisma.ledgerEntry.${r.op}`
    );
    console.log(
      "    splits the money by direction and does not exclude a reversed pair."
    );
    console.log(
      "    Add `reversesId: null` and `reversedBy: { is: null }` to the where,"
    );
    console.log("    or group both directions and net them.");
  }
}

console.log(
  flagged === 0
    ? `\n${checked} directional ledger read(s) checked. None counts a cancelled transaction as money.`
    : `\n${flagged} of ${checked} directional ledger read(s) would count a cancelled transaction as money.`
);
process.exit(flagged === 0 ? 0 : 1);
