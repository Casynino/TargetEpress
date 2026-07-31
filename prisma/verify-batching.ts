/**
 * Checks that batch assignment is automatic and cannot put cargo on the wrong
 * flight.
 *
 *   npx tsx --conditions=react-server prisma/verify-batching.ts
 *
 * Runs the real assignToOpenBatch against the real database inside a
 * transaction that is always rolled back, so it proves the shipped logic
 * without leaving anything behind. Exits non-zero on a failure, which makes it
 * usable as a pre-deploy gate.
 */
import { PrismaClient } from "@prisma/client";

import { assignToOpenBatch } from "../lib/batching";

const prisma = new PrismaClient();

let failures = 0;

function check(name: string, passed: boolean, detail: string) {
  if (!passed) failures++;
  console.log(`${passed ? "✓" : "✗"} ${name}\n    ${detail}`);
}

async function main() {
  // Everything happens inside one transaction that is rolled back at the end.
  await prisma
    .$transaction(async (tx) => {
      const light = { weightKg: 5, packages: 1 };

      // 1. Normal goods land on a Guangzhou batch, electronics on Hong Kong.
      const gz = await assignToOpenBatch(tx, "GUANGZHOU", light);
      const hk = await assignToOpenBatch(tx, "HONG_KONG", light);

      const gzBatch = await tx.batch.findUnique({
        where: { id: gz.batchId },
        select: { origin: true, status: true, batchNumber: true },
      });
      const hkBatch = await tx.batch.findUnique({
        where: { id: hk.batchId },
        select: { origin: true, status: true, batchNumber: true },
      });

      check(
        "Guangzhou route goes to a Guangzhou batch",
        gzBatch?.origin === "GUANGZHOU",
        `${gz.batchNumber} is ${gzBatch?.origin}`
      );
      check(
        "Hong Kong route goes to a Hong Kong batch",
        hkBatch?.origin === "HONG_KONG",
        `${hk.batchNumber} is ${hkBatch?.origin}`
      );
      check(
        "The two routes never share a batch",
        gz.batchId !== hk.batchId,
        `${gz.batchNumber} ≠ ${hk.batchNumber}`
      );

      // 2. A second shipment on the same route joins the same open batch.
      const again = await assignToOpenBatch(tx, "GUANGZHOU", light);
      check(
        "A second shipment reuses the open batch",
        again.batchId === gz.batchId && !again.created,
        `both landed on ${again.batchNumber}`
      );

      // 3. With no open batch for a route, one is created.
      await tx.batch.updateMany({
        where: { origin: "HONG_KONG", status: "OPEN" },
        data: { status: "READY_TO_DEPART" },
      });
      const afterSeal = await assignToOpenBatch(tx, "HONG_KONG", light);
      check(
        "Sealing every batch makes the next shipment open a new one",
        afterSeal.created && afterSeal.batchId !== hk.batchId,
        `opened ${afterSeal.batchNumber}`
      );

      // 4. A sealed batch never takes more cargo.
      const sealedStillSealed = await tx.batch.findUnique({
        where: { id: hk.batchId },
        select: { status: true },
      });
      check(
        "The sealed batch stays sealed",
        sealedStillSealed?.status === "READY_TO_DEPART",
        `${hk.batchNumber} is ${sealedStillSealed?.status}`
      );

      // 5. Capacity: a weight limit rolls the batch to FULL and opens the next.
      await tx.batch.update({
        where: { id: afterSeal.batchId },
        data: { maxWeightKg: 10 },
      });
      const heavy = await assignToOpenBatch(tx, "HONG_KONG", {
        weightKg: 50,
        packages: 1,
      });
      const nowFull = await tx.batch.findUnique({
        where: { id: afterSeal.batchId },
        select: { status: true },
      });
      check(
        "Exceeding the weight limit marks the batch FULL",
        nowFull?.status === "FULL",
        `${afterSeal.batchNumber} is ${nowFull?.status}`
      );
      check(
        "…and the shipment goes on a fresh batch",
        heavy.created && heavy.sealedFull === afterSeal.batchNumber,
        `opened ${heavy.batchNumber} after ${heavy.sealedFull} filled up`
      );

      // 6. Batch numbers carry their route.
      //
      // Only newly-minted numbers are checked. The batches imported from the
      // real packing lists keep their own numbers (GZ/26-22, HK/26-12) — those
      // are what the cartons in China are physically marked with, and renaming
      // them to fit a format would break the link to the paperwork.
      const minted = [afterSeal, heavy].filter((a) => a.created);
      check(
        "Newly opened batches are numbered by route",
        minted.length > 0 &&
          minted.every((a) => /^(HK|GZ)-\d{4}-\d{3}$/.test(a.batchNumber)),
        minted.map((a) => a.batchNumber).join(", ")
      );
      check(
        "…and a Hong Kong batch is numbered HK",
        minted.every((a) => a.batchNumber.startsWith("HK-")),
        minted.map((a) => a.batchNumber).join(", ")
      );

      throw new Error("ROLLBACK");
    })
    .catch((error) => {
      if (!(error instanceof Error) || error.message !== "ROLLBACK") throw error;
    });

  console.log(
    `\n${failures === 0 ? "PASS — assignment is automatic and route-safe" : `FAIL — ${failures} check(s) failed`}`
  );
  if (failures) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
