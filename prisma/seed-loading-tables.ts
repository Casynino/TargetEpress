/**
 * Creates the two permanent loading tables, and converts the imported packing
 * lists into them.
 *
 *   npx tsx prisma/seed-loading-tables.ts            # dry run
 *   npx tsx prisma/seed-loading-tables.ts --apply
 *
 * There are exactly two, one per route, and they are never created again. Cargo
 * received in China lands on one and waits there until it is dispatched.
 *
 * The two imported batches (GZ/26-22, HK/26-12) are not moved — they ARE the
 * cargo currently waiting in China, so each is converted in place into its
 * route's loading table. No cargo changes hands, and every piece keeps the
 * carton reference from its packing list.
 *
 * Safe to re-run: it will not create a second loading table for a route.
 */
import { PrismaClient, type Origin } from "@prisma/client";

const prisma = new PrismaClient();

/** The fixed identifier of each loading table. Never shown to staff. */
const LOADING_NUMBER: Record<Origin, string> = {
  GUANGZHOU: "GZ-LOADING",
  HONG_KONG: "HK-LOADING",
};

const ROUTE_LABEL: Record<Origin, string> = {
  GUANGZHOU: "Guangzhou Batch",
  HONG_KONG: "Hong Kong Batch",
};

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply) console.log("DRY RUN — pass --apply to write.\n");

  for (const route of ["GUANGZHOU", "HONG_KONG"] as Origin[]) {
    const existing = await prisma.batch.findFirst({
      where: { origin: route, permanent: true },
      select: { batchNumber: true, _count: { select: { shipments: true } } },
    });

    if (existing) {
      console.log(
        `${ROUTE_LABEL[route]}: already exists (${existing._count.shipments} pieces waiting)`
      );
      continue;
    }

    // Prefer converting the open batch that already holds this route's cargo:
    // that cargo IS what is waiting in China, so the batch already is the
    // loading table in everything but name.
    const candidate = await prisma.batch.findFirst({
      where: { origin: route, status: { in: ["OPEN", "FULL"] }, permanent: false },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        batchNumber: true,
        _count: { select: { shipments: true } },
      },
    });

    if (candidate) {
      console.log(
        `${ROUTE_LABEL[route]}: convert ${candidate.batchNumber} ` +
          `(${candidate._count.shipments} pieces stay exactly where they are)`
      );
      if (apply) {
        await prisma.batch.update({
          where: { id: candidate.id },
          data: {
            batchNumber: LOADING_NUMBER[route],
            permanent: true,
            status: "OPEN",
            // A loading table has no flight of its own. Anything the packing
            // list carried belongs to the dispatch that eventually takes it.
            airline: null,
            flightNumber: null,
            waybillNumber: null,
            departureDate: null,
            arrivalDate: null,
            expectedArrival: null,
            notes: `Permanent loading table. Converted from ${candidate.batchNumber}.`,
          },
        });
      }
      continue;
    }

    console.log(`${ROUTE_LABEL[route]}: create empty`);
    if (apply) {
      await prisma.batch.create({
        data: {
          batchNumber: LOADING_NUMBER[route],
          origin: route,
          permanent: true,
          status: "OPEN",
          notes: "Permanent loading table.",
        },
      });
    }
  }

  if (apply) {
    const tables = await prisma.batch.findMany({
      where: { permanent: true },
      select: {
        batchNumber: true,
        origin: true,
        _count: { select: { shipments: true } },
      },
    });
    console.log("\nLoading tables:");
    for (const table of tables) {
      console.log(
        `  ${ROUTE_LABEL[table.origin].padEnd(16)} ${table.batchNumber.padEnd(12)} ${table._count.shipments} pieces`
      );
    }
  } else {
    console.log("\nNothing was written. Re-run with --apply.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
