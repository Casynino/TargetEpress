/**
 * Checks that cargo lands on the right loading table, automatically.
 *
 *   npm run verify:batching
 *
 * Runs the real assignment code against the real database inside a transaction
 * that is always rolled back, so it can be run against production data without
 * changing anything.
 */
import { PrismaClient } from "@prisma/client";

import { assignToLoadingTable } from "../lib/batching";

const prisma = new PrismaClient();

type Check = { name: string; pass: boolean; detail: string };

async function main() {
  const checks: Check[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      const gz = await assignToLoadingTable(tx, "GUANGZHOU");
      const hk = await assignToLoadingTable(tx, "HONG_KONG");

      checks.push({
        name: "Normal goods land on the Guangzhou table",
        pass: gz.batchNumber === "GZ-LOADING",
        detail: gz.batchNumber,
      });

      checks.push({
        name: "Electronics and special goods land on the Hong Kong table",
        pass: hk.batchNumber === "HK-LOADING",
        detail: hk.batchNumber,
      });

      checks.push({
        name: "The two routes never share a table",
        pass: gz.batchId !== hk.batchId,
        detail: `${gz.batchNumber} \u2260 ${hk.batchNumber}`,
      });

      const again = await assignToLoadingTable(tx, "GUANGZHOU");
      checks.push({
        name: "Every piece of cargo reuses the same permanent table",
        pass: again.batchId === gz.batchId,
        detail: "no new table was created",
      });

      const tables = await tx.batch.count({ where: { permanent: true } });
      checks.push({
        name: "There are exactly two loading tables",
        pass: tables === 2,
        detail: `${tables} found`,
      });

      const dispatched = await tx.batch.count({
        where: { permanent: true, status: { not: "OPEN" } },
      });
      checks.push({
        name: "Loading tables are always open",
        pass: dispatched === 0,
        detail: dispatched === 0 ? "both OPEN" : `${dispatched} not OPEN`,
      });

      // Nothing here should survive.
      throw new Error("ROLLBACK");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "ROLLBACK") throw error;
  }

  let failures = 0;
  for (const check of checks) {
    if (!check.pass) failures++;
    console.log(`${check.pass ? "\u2713" : "\u2717"} ${check.name}\n    ${check.detail}`);
  }

  console.log(
    `\n${failures === 0 ? "PASS \u2014 assignment is automatic and route-safe" : `FAIL \u2014 ${failures} problem(s)`}`
  );
  if (failures) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
