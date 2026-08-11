/**
 * Fill in both languages for cargo that was registered before the system knew
 * about languages.
 *
 * Most of it needs no translation at all: staff had been typing "Accessories
 * (配件)" by hand, so the pairing is already in the text and only has to be
 * split into its own columns. The rest goes through the glossary those very
 * entries seeded.
 *
 * Never touches `description` itself — only the renderings beside it.
 *
 *   npx tsx --conditions=react-server scripts/backfill-translations.mts
 *   npx tsx --conditions=react-server scripts/backfill-translations.mts --commit
 */
import { PrismaClient } from "@prisma/client";

import { translateText } from "../lib/translate";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

async function main() {
  const rows = await prisma.shipment.findMany({
    select: { id: true, trackingNumber: true, description: true, internalNotes: true },
  });

  let both = 0, partial = 0, none = 0;

  for (const row of rows) {
    const described = await translateText(row.description, { learn: true });
    const noted = await translateText(row.internalNotes);
    if (!described) { none++; continue; }

    if (described.en && described.zh) both++;
    else if (described.en || described.zh) partial++;
    else none++;

    if (!COMMIT) continue;
    await prisma.shipment.update({
      where: { id: row.id },
      data: {
        descriptionEn: described.en,
        descriptionZh: described.zh,
        descriptionLang: described.lang,
        internalNotesEn: noted?.en ?? null,
        internalNotesZh: noted?.zh ?? null,
        internalNotesLang: noted?.lang ?? null,
      },
    });
  }

  console.log(`\n${rows.length} consignments`);
  console.log(`  ${both} readable in both languages`);
  console.log(`  ${partial} in one language only`);
  console.log(`  ${none} left as typed (falls back to the original on screen)`);
  console.log(COMMIT ? "\nWritten.\n" : "\nDry run. Re-run with --commit.\n");
}

main()
  .catch((e) => { console.error("Failed:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
