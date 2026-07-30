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
  // The two worked examples from the spec.
  { name: "Normal goods, 15 kg → 12.50/kg", category: "NORMAL_GOODS", weightKg: 15, expect: 187.5 },
  { name: "Laptop × 3 → 45 each", category: "ELECTRONICS", typeName: "Laptop", weightKg: 2.5, quantity: 3, expect: 135 },

  // Tier boundary either side of 10 kg.
  { name: "Normal goods, 9 kg → 13.50/kg", category: "NORMAL_GOODS", weightKg: 9, expect: 121.5 },
  { name: "Normal goods, exactly 10 kg → 12.50/kg", category: "NORMAL_GOODS", weightKg: 10, expect: 125 },
  { name: "Normal goods, 3 × 4 kg = 12 kg → 12.50/kg", category: "NORMAL_GOODS", weightKg: 4, quantity: 3, expect: 150 },

  // Fixed-per-item ignores weight entirely.
  { name: "Smart Phone (Full Box) × 2, heavy → 25 each", category: "ELECTRONICS", typeName: "Smart Phone (Full Box)", weightKg: 40, quantity: 2, expect: 50 },
  { name: "AirPods × 1 → 10", category: "ELECTRONICS", typeName: "AirPods", weightKg: 0.2, expect: 10 },
  { name: "Documents × 1 → 40", category: "ELECTRONICS", typeName: "Documents", weightKg: 0.5, expect: 40 },

  // CORRECTED: these were seeded per-piece and are per-kg in the revised list.
  // A 30 kg printer must bill 405, not 13.50.
  { name: "Printers 30 kg → 13.50/kg (was wrongly per-piece)", category: "LIQUID_SPECIAL", typeName: "Printers", weightKg: 30, expect: 405 },
  { name: "Batteries 5 kg → 13.50/kg", category: "LIQUID_SPECIAL", typeName: "Batteries", weightKg: 5, expect: 67.5 },
  { name: "Speakers 12 kg → 13.50/kg (no 10 kg discount here)", category: "LIQUID_SPECIAL", typeName: "Speakers", weightKg: 12, expect: 162 },

  // Medicines & food: per kg, flat.
  { name: "Medicines & Food Stuff 20 kg → 13.50/kg", category: "LIQUID_SPECIAL", typeName: "Medicines & Food Stuff", weightKg: 20, expect: 270 },

  // Electronics NOT on the fixed list now fall back to per-kg rather than
  // coming back unpriced — this is what the revised list asks for.
  { name: "Unlisted electronics 13.8 kg → 13.50/kg fallback", category: "ELECTRONICS", weightKg: 13.8, expect: 186.3 },
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
