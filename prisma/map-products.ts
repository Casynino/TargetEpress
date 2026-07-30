/**
 * Links imported cargo to the products it is actually priced by, and clears
 * superseded products out of the catalogue.
 *
 *   npx tsx prisma/map-products.ts            # dry run — shows what it would do
 *   npx tsx prisma/map-products.ts --apply    # write it
 *
 * Why this exists: the packing-list importer records what the sheet says the
 * cargo is ("Senior phone (老人机)") and which category it falls in, but not
 * which priced product it maps to. Without that link a per-piece item falls
 * through to the category's per-kg catch-all — so two unboxed phones weighing
 * 2.9 kg each bill as USD 78.30 instead of the USD 40 the price list states.
 *
 * Deliberately conservative:
 *  - It only matches within the shipment's existing category, so mapping can
 *    never move cargo onto a different route.
 *  - It never guesses. A description that matches nothing is left unmapped and
 *    reported; unmapped is correct for a coffee machine or a surveying
 *    instrument, which genuinely are not on the price list and should be
 *    charged by weight.
 *  - Longest keyword wins, so "senior phone" beats "phone".
 */
import { PrismaClient } from "@prisma/client";

import { NORMAL_GOODS, PER_PIECE, SPECIAL_PER_KG } from "./price-list";

const prisma = new PrismaClient();

/** Every product the published price list actually contains. */
const CANONICAL = new Set(
  [...NORMAL_GOODS, ...SPECIAL_PER_KG, ...PER_PIECE].map(
    (product) => `${product.category}::${product.name}`
  )
);

type Candidate = {
  id: string;
  name: string;
  category: string;
  keyword: string;
  test: (haystack: string) => boolean;
};

/**
 * Phrases that veto a product even though one of its keywords appears.
 *
 * A phone case is not a phone, a camera battery is not a camera, and a watch
 * strap is not a watch — but each contains the other's name. Getting this wrong
 * is expensive, because all three of those products are priced per item: a
 * carton of phone cases would have billed at USD 25 each.
 */
const NEGATIVE: Record<string, string[]> = {
  "Smart Phone (Full Box)": ["phone case", "phone cover", "手机壳", "手机套", "earphone"],
  "Smart Phone (Unboxed)": ["phone case", "手机壳"],
  Camera: ["camera battery", "相机电池", "camera bag", "相机包"],
  "Smart Watch": ["watch strap", "watch band", "表带"],
  Laptop: ["laptop bag", "laptop stand", "电脑包", "电脑支架"],
  Tablet: ["tablet case", "平板壳"],
};

/**
 * Descriptions where the right answer is a judgment call, not a lookup.
 *
 * A dashcam is literally a camera, but pricing it as one takes a 0.5 kg item
 * from about USD 7 by weight to USD 45 per piece. That is the CEO's call to
 * make, so these are reported and left on the weight rate rather than being
 * quietly assigned the more expensive one.
 */
const AMBIGUOUS: { match: string[]; note: string }[] = [
  {
    match: ["dashboard camera", "dash cam", "行车记录仪"],
    note: "Dashcam — Camera at USD 45/item, or by weight?",
  },
  {
    match: ["surveillance camera", "摄像头"],
    note: "CCTV camera — Camera at USD 45/item, or by weight?",
  },
];

async function archiveStaleProducts(apply: boolean) {
  const active = await prisma.cargoType.findMany({
    where: { active: true },
    select: { id: true, name: true, category: true, _count: { select: { shipments: true } } },
  });

  const stale = active.filter(
    (product) => !CANONICAL.has(`${product.category}::${product.name}`)
  );

  if (stale.length === 0) {
    console.log("Catalogue is clean — every active product is on the price list.\n");
    return;
  }

  console.log(`Superseded products still active: ${stale.length}`);
  for (const product of stale) {
    console.log(
      `  ${product.category.padEnd(15)} ${product.name.padEnd(26)} ` +
        `${product._count.shipments} shipment(s) reference it`
    );
  }

  if (apply) {
    // Archive rather than delete: a shipment may already point at one, and it
    // must keep saying what it contained.
    const { count } = await prisma.cargoType.updateMany({
      where: { id: { in: stale.map((p) => p.id) } },
      data: { active: false },
    });
    console.log(`  → archived ${count}\n`);
  } else {
    console.log("  → would archive these (dry run)\n");
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const remap = process.argv.includes("--remap");
  if (!apply) console.log("DRY RUN — pass --apply to write.\n");

  if (remap && apply) {
    // Clearing first lets a corrected matcher redo mappings an earlier version
    // got wrong, rather than leaving them stuck at the first answer.
    const { count } = await prisma.shipment.updateMany({
      where: { cargoTypeId: { not: null } },
      data: { cargoTypeId: null },
    });
    console.log(`Cleared ${count} existing mapping(s) to redo them.\n`);
  }

  await archiveStaleProducts(apply);

  // Load the catalogue after the clean-up so archived duplicates cannot win a
  // match. Keywords are split into candidates, longest first.
  const products = await prisma.cargoType.findMany({
    select: { id: true, name: true, category: true, keywords: true },
  });

  const candidates: Candidate[] = [];
  for (const product of products) {
    // In a dry run the stale ones are still flagged active in the database, so
    // filter them here too — otherwise the preview would not match the result.
    if (!CANONICAL.has(`${product.category}::${product.name}`)) continue;
    if (!product.keywords) continue;
    for (const keyword of product.keywords.split(",")) {
      const cleaned = keyword.trim().toLowerCase();
      if (cleaned.length < 2) continue;

      // Latin keywords match whole words only. Plain substring matching put
      // "Soldering station" under Rings and "Earphone" under Smart Phone —
      // both from a keyword buried inside a longer, unrelated word. Chinese has
      // no word boundaries, so those keep substring matching.
      const isLatin = /^[\x00-\x7F]+$/.test(cleaned);
      const pattern = isLatin
        ? new RegExp(`\\b${cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
        : null;

      const vetoes = NEGATIVE[product.name] ?? [];

      candidates.push({
        id: product.id,
        name: product.name,
        category: product.category,
        keyword: cleaned,
        test: (haystack: string) => {
          if (vetoes.some((veto) => haystack.includes(veto))) return false;
          return pattern ? pattern.test(haystack) : haystack.includes(cleaned);
        },
      });
    }
  }
  candidates.sort((a, b) => b.keyword.length - a.keyword.length);

  const shipments = await prisma.shipment.findMany({
    where: { cargoTypeId: null },
    select: {
      id: true,
      trackingNumber: true,
      description: true,
      cargoCategory: true,
    },
    orderBy: { trackingNumber: "asc" },
  });

  console.log(`Shipments with no product: ${shipments.length}`);

  const matched: { tracking: string; description: string; product: string }[] = [];
  const unmatched: { tracking: string; description: string; category: string }[] = [];
  const crossCategory: {
    tracking: string;
    description: string;
    from: string;
    to: string;
  }[] = [];
  const needsDecision: { tracking: string; description: string; note: string }[] = [];

  for (const shipment of shipments) {
    const haystack = shipment.description.toLowerCase();
    const ambiguous = AMBIGUOUS.find((entry) =>
      entry.match.some((phrase) => haystack.includes(phrase))
    );
    if (ambiguous) {
      needsDecision.push({
        tracking: shipment.trackingNumber,
        description: shipment.description,
        note: ambiguous.note,
      });
      continue;
    }

    const hit = candidates.find(
      (candidate) =>
        candidate.category === shipment.cargoCategory && candidate.test(haystack)
    );

    if (hit) {
      matched.push({
        tracking: shipment.trackingNumber,
        description: shipment.description,
        product: hit.name,
      });
      if (apply) {
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: { cargoTypeId: hit.id },
        });
      }
    } else {
      // Would it have matched under a different category? Report it rather than
      // moving it: a category change is a route change, and this cargo is
      // already loaded into a batch flying from one specific airport.
      const elsewhere = candidates.find((candidate) => candidate.test(haystack));
      if (elsewhere) {
        crossCategory.push({
          tracking: shipment.trackingNumber,
          description: shipment.description,
          from: shipment.cargoCategory,
          to: `${elsewhere.category} / ${elsewhere.name}`,
        });
      }
      unmatched.push({
        tracking: shipment.trackingNumber,
        description: shipment.description,
        category: shipment.cargoCategory,
      });
    }
  }

  const byProduct = matched.reduce<Record<string, number>>((counts, row) => {
    counts[row.product] = (counts[row.product] ?? 0) + 1;
    return counts;
  }, {});

  console.log(`\nMapped: ${matched.length}`);
  for (const [product, count] of Object.entries(byProduct).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)} × ${product}`);
  }

  console.log(`\nLeft unmapped: ${unmatched.length}`);
  console.log("(correct when the goods are genuinely not on the price list —");
  console.log(" these are charged by weight at their category rate)");
  for (const row of unmatched.slice(0, 30)) {
    console.log(`  ${row.tracking}  ${row.category.padEnd(15)} ${row.description.slice(0, 46)}`);
  }
  if (unmatched.length > 30) console.log(`  … and ${unmatched.length - 30} more`);

  if (needsDecision.length > 0) {
    console.log(`\nNeeds the CEO to decide: ${needsDecision.length}`);
    console.log("(left on the weight rate until then — the safer error)");
    for (const row of needsDecision) {
      console.log(
        `  ${row.tracking}  ${row.description.slice(0, 30).padEnd(30)} ${row.note}`
      );
    }
  }

  if (crossCategory.length > 0) {
    console.log(
      `\nMatches a product in a DIFFERENT category: ${crossCategory.length}`
    );
    console.log("(not changed — the category decides the route, and these are");
    console.log(" already loaded into a batch. For the CEO to review.)");
    for (const row of crossCategory) {
      console.log(
        `  ${row.tracking}  ${row.description.slice(0, 34).padEnd(34)} ` +
          `${row.from} → ${row.to}`
      );
    }
  }

  if (!apply) console.log("\nNothing was written. Re-run with --apply.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
