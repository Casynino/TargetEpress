/**
 * Build the cargo glossary out of the company's own history.
 *
 * The Guangzhou desk has been typing "Accessories (配件)" into the description
 * field for months — inventing, by hand, exactly the bilingual record this
 * system now keeps properly. Those entries are a few hundred human-made
 * translations that are already correct for this business's cargo, which is a
 * far better starting vocabulary than anything a general translator would
 * produce for freight.
 *
 * Reads only. Existing terms are left alone; a verified one is never touched.
 *
 *   npx tsx scripts/seed-cargo-terms.mts            # show what it found
 *   npx tsx scripts/seed-cargo-terms.mts --commit   # write the glossary
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const CJK = /[一-鿿]/;
const PAIR = /^(.+?)\s*[（(]\s*([^（()）]+?)\s*[)）]\s*$/;

function pairOf(text: string) {
  const m = text.trim().replace(/[（]/g, "(").replace(/[）]/g, ")").match(PAIR);
  if (!m) return null;
  const [, a, b] = m;
  const aCjk = CJK.test(a);
  if (aCjk === CJK.test(b)) return null;
  return {
    zh: (aCjk ? a : b).trim(),
    en: (aCjk ? b : a).trim(),
  };
}

async function main() {
  const rows = await prisma.shipment.findMany({ select: { description: true } });
  const found = new Map<string, { zh: string; en: string; n: number }>();
  let skipped = 0;

  for (const { description } of rows) {
    const pair = pairOf(description);
    if (!pair || !pair.zh || !pair.en) { skipped++; continue; }
    const prev = found.get(pair.zh);
    found.set(pair.zh, { ...pair, n: (prev?.n ?? 0) + 1 });
  }

  console.log(`\n${rows.length} consignments -> ${found.size} term pairs (${skipped} yielded none)`);
  if (!COMMIT) {
    [...found.values()].sort((a, b) => b.n - a.n).slice(0, 15)
      .forEach((t) => console.log(`  ${String(t.n).padStart(3)}x  ${t.zh.padEnd(10)} -> ${t.en}`));
    console.log("\nDry run. Re-run with --commit to write them.\n");
    return;
  }

  let created = 0, bumped = 0;
  for (const term of found.values()) {
    const existing = await prisma.cargoTerm.findUnique({
      where: { zh: term.zh },
      select: { id: true },
    });
    if (existing) {
      await prisma.cargoTerm.update({
        where: { id: existing.id },
        data: { timesUsed: { increment: term.n } },
      });
      bumped++;
      continue;
    }
    await prisma.cargoTerm.create({
      data: { zh: term.zh, en: term.en, source: "SEEDED", timesUsed: term.n },
    });
    created++;
  }

  console.log(`  created ${created}, already knew ${bumped}`);
  console.log(`  glossary now holds ${await prisma.cargoTerm.count()} terms\n`);
}

main()
  .catch((e) => { console.error("Failed:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
