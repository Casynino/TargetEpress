/**
 * PER KILO OR PER PIECE, FOR ONE CONSIGNMENT.
 *
 * The desk may charge a consignment in the other unit from the rate book's —
 * two documents the book sells at USD 40 each, agreed at 13.50 a kilo. Two
 * derivations decide what that bill says, and both have already been wrong
 * once: the per-kilo quantity skipped the route's minimum (0.4 kg billed 5.40),
 * and the bill printed the scale weight beside a freight charged on 1 kg.
 * Pinned here rather than trusted.
 *
 * Reads the local rate book, so run it against a database seeded like the live
 * one (Documents USD 40 each; Electronics USD 13.50/kg, minimum 1 kg; normal
 * goods 13.50/kg under 10 kg).
 */
import { Prisma } from "@prisma/client";

import { rateFactsOf } from "@/lib/agreed-rate";
import { prisma } from "@/lib/prisma";
import { weightBasisOf } from "@/lib/rate-basis";

const D = (v: number) => new Prisma.Decimal(v);
let bad = 0;
const check = (label: string, got: unknown, expected: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) bad++;
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${label.padEnd(58)} → ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`
  );
};

/* ── What a per-kilo rate multiplies ─────────────────────────────────────── */

check(
  "documents 0.4 kg switched to per kg: route minimum",
  await weightBasisOf({ cargoCategory: "ELECTRONICS", weightKg: 0.4, packages: 2, quotedMethod: "FIXED_PER_ITEM", chargeableKg: null }),
  1
);
check(
  "documents 2.6 kg switched to per kg: own weight",
  await weightBasisOf({ cargoCategory: "ELECTRONICS", weightKg: 2.6, packages: 3, quotedMethod: "FIXED_PER_ITEM", chargeableKg: null }),
  2.6
);
check(
  "weight-priced cargo keeps its own billed weight",
  await weightBasisOf({ cargoCategory: "NORMAL_GOODS", weightKg: 3.8, packages: 4, quotedMethod: "WEIGHT_BASED", chargeableKg: D(3.8) }),
  3.8
);
check(
  "weight-priced cargo under the minimum keeps its billed 1 kg",
  await weightBasisOf({ cargoCategory: "NORMAL_GOODS", weightKg: 0.3, packages: 1, quotedMethod: "WEIGHT_BASED", chargeableKg: D(1) }),
  1
);

/* ── What every screen reads ─────────────────────────────────────────────── */

const docsShipment = { quotedRate: D(40), quotedMethod: "FIXED_PER_ITEM", chargeableKg: null, weightKg: D(0.4), packages: 2 };
const kgShipment = { quotedRate: D(13.5), quotedMethod: "WEIGHT_BASED", chargeableKg: D(3.8), weightKg: D(3.8), packages: 4 };

const switchedToKg = rateFactsOf(
  { freightRateOverride: D(13.5), freightRateMethod: "WEIGHT_BASED", freightRateQuantity: D(1) },
  docsShipment
);
check("per piece → per kg: charged per kg", switchedToKg.ratePerItem, false);
check("per piece → per kg: book still per piece", switchedToKg.bookPerItem, true);
check("per piece → per kg: named as switched", switchedToKg.unitSwitched, true);
check("per piece → per kg: priced on the stored 1 kg, not 0.4", switchedToKg.ratePricedOn, 1);

const switchedToPiece = rateFactsOf(
  { freightRateOverride: D(10), freightRateMethod: "FIXED_PER_ITEM", freightRateQuantity: D(4) },
  kgShipment
);
check("per kg → per piece: charged per piece", switchedToPiece.ratePerItem, true);
check("per kg → per piece: named as switched", switchedToPiece.unitSwitched, true);
check("per kg → per piece: priced on 4 pieces", switchedToPiece.ratePricedOn, 4);

const sameUnit = rateFactsOf(
  { freightRateOverride: D(11.5), freightRateMethod: "WEIGHT_BASED", freightRateQuantity: D(3.8) },
  kgShipment
);
check("agreed rate in the book's unit: not a switch", sameUnit.unitSwitched, false);

const legacy = rateFactsOf({ freightRateOverride: D(11.5) }, kgShipment);
check("rate agreed before units were stored: book's unit", [legacy.ratePerItem, legacy.unitSwitched, legacy.ratePricedOn], [false, false, 3.8]);

const cleared = rateFactsOf(
  { freightRateOverride: null, freightRateMethod: "WEIGHT_BASED", freightRateQuantity: D(1) },
  docsShipment
);
check("no rate on the bill: no switch, book quantity", [cleared.unitSwitched, cleared.ratePricedOn], [false, 2]);

console.log(bad === 0 ? "\nAll rate-switch cases correct." : `\n${bad} FAILED`);
await prisma.$disconnect();
process.exit(bad === 0 ? 0 : 1);
