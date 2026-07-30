/**
 * Checks the live rate book against the worked examples in the pricing spec.
 *
 *   npx tsx prisma/verify-pricing.ts
 *
 * Runs the real engine (lib/pricing), not a copy of it, so a change to
 * resolution or tier logic shows up here. Exits non-zero on a mismatch, which
 * makes it usable as a pre-deploy gate after any rate change.
 */
import { PrismaClient } from "@prisma/client";

import { quote } from "../lib/pricing";

const prisma = new PrismaClient();

type Case = {
  name: string;
  category: "NORMAL_GOODS" | "ELECTRONICS" | "LIQUID_SPECIAL";
  typeName?: string;
  weightKg: number;
  quantity?: number;
  /** Expected total, or null when the cargo should come back unpriced. */
  expect: number | null;
};

const CASES: Case[] = [
  // The two examples given in the spec.
  { name: "Normal goods, 15 kg → 12.50/kg", category: "NORMAL_GOODS", weightKg: 15, expect: 187.5 },
  { name: "Laptop × 3 → 45 each", category: "ELECTRONICS", typeName: "Laptop", weightKg: 2.5, quantity: 3, expect: 135 },

  // Tier behaviour either side of the 10 kg boundary.
  { name: "Normal goods, 9 kg → 13.50/kg", category: "NORMAL_GOODS", weightKg: 9, expect: 121.5 },
  { name: "Normal goods, exactly 10 kg → 12.50/kg", category: "NORMAL_GOODS", weightKg: 10, expect: 125 },
  { name: "Normal goods, 3 × 4 kg = 12 kg → 12.50/kg", category: "NORMAL_GOODS", weightKg: 4, quantity: 3, expect: 150 },

  // Fixed-per-item ignores weight entirely.
  { name: "Smart Phone (Full Box) × 2, heavy → 25 each", category: "ELECTRONICS", typeName: "Smart Phone (Full Box)", weightKg: 40, quantity: 2, expect: 50 },
  { name: "AirPods × 1 → 10", category: "ELECTRONICS", typeName: "AirPods", weightKg: 0.2, expect: 10 },

  // Liquid & special is flat per kg.
  { name: "Liquid & special, 20 kg → 13.50/kg", category: "LIQUID_SPECIAL", weightKg: 20, expect: 270 },

  // An electronics item with no published rate must refuse, not guess.
  { name: "Electronics with no type chosen → unpriced", category: "ELECTRONICS", weightKg: 13.8, expect: null },
];

async function main() {
  let failures = 0;

  for (const testCase of CASES) {
    const cargoTypeId = testCase.typeName
      ? (
          await prisma.cargoType.findFirst({
            where: { name: testCase.typeName },
            select: { id: true },
          })
        )?.id ?? null
      : null;

    if (testCase.typeName && !cargoTypeId) {
      console.log(`✗ ${testCase.name}\n    cargo type "${testCase.typeName}" not found`);
      failures++;
      continue;
    }

    const result = await quote({
      category: testCase.category,
      cargoTypeId,
      weightKg: testCase.weightKg,
      quantity: testCase.quantity,
    });

    const actual = result.ok ? Number(result.total.toFixed(2)) : null;
    const pass = actual === testCase.expect;

    if (!pass) failures++;
    const shown =
      actual === null ? "unpriced" : `USD ${actual.toFixed(2)}`;
    const wanted =
      testCase.expect === null ? "unpriced" : `USD ${testCase.expect.toFixed(2)}`;

    console.log(
      `${pass ? "✓" : "✗"} ${testCase.name}\n    got ${shown}, expected ${wanted}` +
        (result.ok
          ? `\n    route ${result.route}, ${result.method}, rate ${result.rate}`
          : "")
    );
  }

  console.log(
    `\n${CASES.length - failures}/${CASES.length} passed${failures ? ` — ${failures} FAILED` : ""}`
  );
  if (failures) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
