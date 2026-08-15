/**
 * Moves cargo into the batch its category actually flies on.
 *
 *   npx tsx prisma/fix-batch-routes.ts            # dry run
 *   npx tsx prisma/fix-batch-routes.ts --apply    # write it
 *
 * The rule, stated by the business: normal goods leave Guangzhou; electronics
 * and special goods leave Hong Kong. Nothing else.
 *
 * Two different faults produce the same symptom, and they need opposite fixes:
 *
 *  1. The CATEGORY is wrong. "LCD" and "Memory cards" are normal goods on the
 *     published price list, but the importer's keyword guess filed them as
 *     electronics. The cargo is on the right flight; the label on it is wrong.
 *     Correcting the category resolves the conflict and moves nothing.
 *  2. The cargo really is on the wrong batch. Only then is it moved.
 *
 * Doing (1) first matters: moving an LCD panel to Hong Kong because it was
 * mislabelled would put real cargo on the wrong flight to fix a typo.
 *
 * Only touches cargo that has not left yet (OPEN batches, READY_TO_DEPART).
 * A shipment that has already flown cannot be retrospectively moved onto a
 * different flight — that would be rewriting history, not fixing data.
 */
import { PrismaClient, type CargoCategory, type Origin } from "@prisma/client";

import { ROUTE_FOR_CATEGORY, originFromBatchNumber } from "../lib/cargo";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply) console.log("DRY RUN — pass --apply to write.\n");

  /*
    This script trusts batch.origin absolutely — it rewrites a consignment's
    CATEGORY to agree with the batch it sits on, and category is what the rate
    book is keyed on. So a batch whose stored location is wrong would not just
    mislabel cargo, it would reprice it: ten electronics pieces on a batch
    mistakenly marked Guangzhou would be rewritten into normal goods and quoted
    off the wrong list.

    Not hypothetical. HK-0013 was imported as a Guangzhou batch and sat that way
    for weeks with exactly those ten pieces on it. So before touching anything,
    the number is checked against the location: they disagree only when
    something upstream is broken, and a repair script must never build on top of
    a fault it cannot see.
  */
  const all = await prisma.batch.findMany({
    select: { batchNumber: true, origin: true },
  });
  const contradictory = all.filter((b) => {
    const fromNumber = originFromBatchNumber(b.batchNumber);
    return fromNumber !== null && fromNumber !== b.origin;
  });
  if (contradictory.length > 0) {
    console.error(
      "Refusing to run. These batches are stored under a location their own number\n" +
        "contradicts, and this script would rewrite cargo categories to match the\n" +
        "wrong one:\n" +
        contradictory
          .map((b) => `  ${b.batchNumber} is stored as ${b.origin}`)
          .join("\n") +
        "\n\nRun scripts/fix-batch-numbering.mts first."
    );
    process.exit(1);
  }

  const openBatches = await prisma.batch.findMany({
    where: { status: "OPEN" },
    // Newest first — which is the rule the line below states and did not follow.
    orderBy: { createdAt: "desc" },
    select: { id: true, batchNumber: true, origin: true },
  });

  const batchForRoute = new Map<Origin, (typeof openBatches)[number]>();
  for (const batch of openBatches) {
    // Newest open batch per location wins if there is more than one.
    if (!batchForRoute.has(batch.origin)) batchForRoute.set(batch.origin, batch);
  }

  console.log("Open batches:");
  for (const [origin, batch] of batchForRoute) {
    console.log(`  ${origin.padEnd(11)} → ${batch.batchNumber}`);
  }

  const shipments = await prisma.shipment.findMany({
    where: { status: "READY_TO_DEPART", batch: { status: "OPEN" } },
    select: {
      id: true,
      trackingNumber: true,
      description: true,
      cargoCategory: true,
      origin: true,
      batch: { select: { batchNumber: true, origin: true } },
    },
    orderBy: { trackingNumber: "asc" },
  });

  // Pass 1 — correct categories the price list itself disagrees with. A product
  // named in the catalogue is authoritative about which category it belongs to;
  // the importer's keyword guess is not.
  const products = await prisma.cargoType.findMany({
    where: { active: true },
    select: { id: true, name: true, category: true, keywords: true },
  });

  const productMatches = (description: string, keywords: string | null) => {
    if (!keywords) return false;
    const haystack = description.toLowerCase();
    return keywords.split(",").some((raw) => {
      const keyword = raw.trim().toLowerCase();
      if (keyword.length < 2) return false;
      // Whole-word for Latin, substring for Chinese — same rule as the mapper.
      return /^[\x00-\x7F]+$/.test(keyword)
        ? new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack)
        : haystack.includes(keyword);
    });
  };

  const reclassified: {
    tracking: string;
    description: string;
    from: string;
    to: string;
    product: string;
  }[] = [];

  for (const shipment of shipments) {
    const shouldFly = ROUTE_FOR_CATEGORY[shipment.cargoCategory as CargoCategory];
    if (!shipment.batch || shipment.batch.origin === shouldFly) continue;

    // Does a product in a category that DOES match this batch's airport claim
    // this description? If so, the category was simply wrong.
    const better = products.find(
      (product) =>
        product.category !== shipment.cargoCategory &&
        ROUTE_FOR_CATEGORY[product.category] === shipment.batch!.origin &&
        productMatches(shipment.description, product.keywords)
    );
    if (!better) continue;

    reclassified.push({
      tracking: shipment.trackingNumber,
      description: shipment.description,
      from: shipment.cargoCategory,
      to: better.category,
      product: better.name,
    });

    if (apply) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { cargoCategory: better.category, cargoTypeId: better.id },
      });
      // Reflect it locally so pass 2 does not also try to move this one.
      shipment.cargoCategory = better.category;
    } else {
      shipment.cargoCategory = better.category;
    }
  }

  console.log(`\n${apply ? "Recategorised" : "Would recategorise"}: ${reclassified.length}`);
  console.log("(the price list names these products in a different category —");
  console.log(" the cargo is on the right flight, the label was wrong)");
  for (const row of reclassified) {
    console.log(
      `  ${row.tracking}  ${row.description.slice(0, 36).padEnd(36)} ${row.from} → ${row.to} (${row.product})`
    );
  }

  // Pass 2 — whatever still conflicts really is on the wrong batch.
  const moves: {
    tracking: string;
    description: string;
    from: string;
    to: string;
    id: string;
    route: Origin;
  }[] = [];
  const stranded: { tracking: string; description: string; route: Origin }[] = [];

  for (const shipment of shipments) {
    const shouldFly = ROUTE_FOR_CATEGORY[shipment.cargoCategory as CargoCategory];
    if (!shipment.batch || shipment.batch.origin === shouldFly) continue;

    const target = batchForRoute.get(shouldFly);
    if (!target) {
      stranded.push({
        tracking: shipment.trackingNumber,
        description: shipment.description,
        route: shouldFly,
      });
      continue;
    }

    moves.push({
      id: shipment.id,
      tracking: shipment.trackingNumber,
      description: shipment.description,
      from: shipment.batch.batchNumber,
      to: target.batchNumber,
      route: shouldFly,
    });

    if (apply) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          batchId: target.id,
          // The shipment's own origin has to follow the batch it is on, or the
          // label and the manifest would disagree about which airport it left.
          origin: shouldFly,
        },
      });
    }
  }

  console.log(`\n${apply ? "Moved" : "Would move"}: ${moves.length}`);
  for (const move of moves) {
    console.log(
      `  ${move.tracking}  ${move.description.slice(0, 40).padEnd(40)} ${move.from} → ${move.to}`
    );
  }

  if (stranded.length > 0) {
    console.log(
      `\nNo open batch to move these to (${stranded.length}) — open one first:`
    );
    for (const row of stranded) {
      console.log(`  ${row.tracking}  ${row.description.slice(0, 40)}  needs ${row.route}`);
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
