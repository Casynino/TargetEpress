/**
 * PER KILO OR PER PIECE, FOR ONE CONSIGNMENT.
 *
 * The desk may charge a consignment in the other unit from the rate book's —
 * two documents the book sells at USD 40 each, agreed at 13.50 a kilo. What
 * that costs the customer has already been wrong several ways: the per-kilo
 * quantity skipped the route's minimum (0.4 kg billed 5.40), the bill printed
 * the scale weight beside a freight charged on 1 kg, a re-weigh moved a freight
 * nobody re-agreed, and putting a change back restored an old rate in the new
 * unit. Pinned here rather than trusted.
 *
 * Drives the real pricing code against real cargo, and writes agreed rates the
 * way setFreightRate writes them. Needs the local
 * database and a rate book seeded like the live one (Documents USD 40 each;
 * Electronics USD 13.50/kg, minimum 1 kg; normal goods 13.50/kg under 10 kg):
 *   npm run check:rate-switch
 */
import { Prisma } from "@prisma/client";

import { rateFactsOf } from "@/lib/agreed-rate";
import { autoPriceShipments } from "@/lib/auto-price";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { agreedQuantityOf, agreementBefore } from "@/lib/rate-basis";

const BATCH = "cmtq60p8e0001sbwj6lk8i27a";
const CUST = "cmt2hbebb0236sbzl7s6u2rl2";
const DOCS = "cms7h4ae0000wy8e5dvky0qdw";
const ACTOR = "cms7eq2ew000ky8fma02kqgms";

const D = (v: number) => new Prisma.Decimal(v);
let bad = 0;
const check = (label: string, got: unknown, expected: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) bad++;
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${label.padEnd(64)} → ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`
  );
};

/* Every ZZ- consignment, not only this file's: a leftover from another guard
   on the same customer and flight joins every pool and fails cases that have
   nothing wrong with them. */
async function wipe() {
  const rows = await prisma.shipment.findMany({
    where: { trackingNumber: { startsWith: "ZZ" } },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  await prisma.invoicePriceChange.deleteMany({ where: { invoice: { shipmentId: { in: ids } } } });
  await prisma.invoice.deleteMany({ where: { shipmentId: { in: ids } } });
  await prisma.package.deleteMany({ where: { shipmentId: { in: ids } } });
  await prisma.shipment.deleteMany({ where: { id: { in: ids } } });
}

let n = 0;
/** A consignment checked in, priced by the book, and confirmed. */
async function landed(kind: "docs" | "electronics", kg: number, pieces = 1) {
  n += 1;
  const tn = `ZZR-${String(n).padStart(3, "0")}`;
  const s = await prisma.shipment.create({
    data: {
      trackingNumber: tn, qrToken: tn.toLowerCase(), customerId: CUST, batchId: BATCH,
      cargoCategory: "ELECTRONICS", cargoTypeId: kind === "docs" ? DOCS : null,
      goodsType: "GENERAL_MERCHANDISE", description: "rate switch guard",
      weightKg: kg, packages: pieces, status: "RECEIVED_AT_DAR",
      arrivedAt: new Date(), origin: "HONG_KONG",
    },
    select: { id: true, trackingNumber: true },
  });
  await autoPriceShipments([s.id], ACTOR);
  await prisma.invoice.updateMany({
    where: { shipmentId: s.id },
    data: { status: "UNPAID", confirmedAt: new Date() },
  });
  return s;
}

/** Agree a rate the way setFreightRate does: quantity from the shared rule. */
async function agree(shipmentId: string, rate: number, byItem: boolean) {
  const inv = await prisma.invoice.findFirstOrThrow({
    where: { shipmentId },
    select: {
      id: true, total: true, freightCost: true, freightOverride: true,
      freightRateOverride: true, freightRateMethod: true, freightRateQuantity: true,
      shipment: {
        select: { id: true, cargoCategory: true, weightKg: true, packages: true, quotedMethod: true, chargeableKg: true },
      },
    },
  });
  const qty = await agreedQuantityOf({ shipment: inv.shipment, invoice: inv, rate, byItem });
  const freight = Math.round(rate * qty * 100) / 100;
  const before = toNumber(inv.freightOverride ?? inv.freightCost);
  await prisma.invoice.update({
    where: { id: inv.id },
    data: {
      freightRateOverride: D(rate),
      freightRateMethod: byItem ? "FIXED_PER_ITEM" : "WEIGHT_BASED",
      freightRateQuantity: D(qty),
      freightOverride: D(freight),
      total: D(Math.round((toNumber(inv.total) - before + freight) * 100) / 100),
    },
  });
  return { qty, freight };
}

async function freightOf(shipmentId: string) {
  const inv = await prisma.invoice.findFirstOrThrow({
    where: { shipmentId },
    select: { freightCost: true, freightOverride: true },
  });
  return toNumber(inv.freightOverride ?? inv.freightCost);
}

await wipe();

/* ── The quantity a per-kilo rate multiplies ─────────────────────────────── */

{
  const a = await landed("docs", 0.4, 2);
  check("documents 0.4 kg per kg on their own: the 1 kg minimum", (await agree(a.id, 13.5, false)).qty, 1);
  await wipe();
}
{
  const a = await landed("docs", 2.6, 3);
  check("documents 2.6 kg per kg: their own weight", (await agree(a.id, 13.5, false)).qty, 2.6);
  await wipe();
}
{
  const a = await landed("docs", 0.4, 2);
  check("documents per piece: the piece count", (await agree(a.id, 30, true)).qty, 2);
  await wipe();
}

/* ── A quantity once agreed stands ───────────────────────────────────────── */

{
  const d = await landed("docs", 0.4, 2);
  await agree(d.id, 13.5, false);
  await prisma.shipment.update({ where: { id: d.id }, data: { weightKg: 2.6 } });
  check("re-weighed, same rate and unit: the agreed 1 kg stands", (await agree(d.id, 13.5, false)).qty, 1);
  check("re-weighed, a new rate: priced on the weight now", (await agree(d.id, 12, false)).qty, 2.6);
  await wipe();
}
{
  const d = await landed("docs", 0.4, 2);
  const inv = await prisma.invoice.findFirstOrThrow({
    where: { shipmentId: d.id },
    select: {
      freightOverride: true, freightRateOverride: true, freightRateMethod: true, freightRateQuantity: true,
      shipment: { select: { id: true, cargoCategory: true, weightKg: true, packages: true, quotedMethod: true, chargeableKg: true } },
    },
  });
  const ask = (restored: { quantity: number; freight: number | null }) =>
    agreedQuantityOf({ shipment: inv.shipment, invoice: inv, rate: 35, byItem: true, restored });
  check("restored quantity that reproduces the freight is taken", await ask({ quantity: 2, freight: 70 }), 2);
  check("restored quantity that does not is ignored", await ask({ quantity: 9, freight: 70 }), 2);
  await wipe();
}

{
  const e = await landed("electronics", 3.8);
  await prisma.invoice.updateMany({
    where: { shipmentId: e.id },
    data: { freightRateOverride: D(11.5), freightOverride: D(43.7), total: D(43.7) },
  });
  await prisma.shipment.update({ where: { id: e.id }, data: { weightKg: 4.2 } });
  check("rate agreed before quantities were kept: stands on its own freight", (await agree(e.id, 11.5, false)).qty, 3.8);
  await wipe();
}

/* ── What a price change records as "before" ─────────────────────────────── */

const docsShip = { quotedMethod: "FIXED_PER_ITEM", packages: 2, chargeableKg: null, weightKg: D(0.4) };
const kgShip = { quotedMethod: "WEIGHT_BASED", packages: 4, chargeableKg: D(3.8), weightKg: D(3.8) };
check(
  "rate agreed before units were kept: the book's unit and quantity",
  agreementBefore({ freightOverride: D(70), freightRateOverride: D(35), freightRateMethod: null, freightRateQuantity: null }, docsShip),
  { methodBefore: "FIXED_PER_ITEM", quantityBefore: 2 }
);
check(
  "per-kilo rate agreed before units were kept: its chargeable weight",
  agreementBefore({ freightOverride: D(43.7), freightRateOverride: D(11.5), freightRateMethod: null, freightRateQuantity: null }, kgShip),
  { methodBefore: "WEIGHT_BASED", quantityBefore: 3.8 }
);
check(
  "switched rate: what was stored",
  agreementBefore({ freightOverride: D(13.5), freightRateOverride: D(13.5), freightRateMethod: "WEIGHT_BASED", freightRateQuantity: D(1) }, docsShip),
  { methodBefore: "WEIGHT_BASED", quantityBefore: 1 }
);
check(
  "no rate: nothing",
  agreementBefore({ freightOverride: null, freightRateOverride: null, freightRateMethod: null, freightRateQuantity: null }, docsShip),
  { methodBefore: null, quantityBefore: null }
);

/* ── What every screen reads ─────────────────────────────────────────────── */

const docsShipment = { quotedRate: D(40), quotedMethod: "FIXED_PER_ITEM", chargeableKg: null, weightKg: D(0.4), packages: 2 };
const kgShipment = { quotedRate: D(13.5), quotedMethod: "WEIGHT_BASED", chargeableKg: D(3.8), weightKg: D(3.8), packages: 4 };

const switchedToKg = rateFactsOf(
  { freightRateOverride: D(13.5), freightRateMethod: "WEIGHT_BASED", freightRateQuantity: D(1), freightCost: D(80) },
  docsShipment
);
check(
  "per piece → per kg: unit, book unit, switched, quantity, book freight",
  [switchedToKg.ratePerItem, switchedToKg.bookPerItem, switchedToKg.unitSwitched, switchedToKg.ratePricedOn, switchedToKg.agreedQuantity, switchedToKg.bookFreight],
  [false, true, true, 1, 1, 80]
);
const switchedToPiece = rateFactsOf(
  { freightRateOverride: D(10), freightRateMethod: "FIXED_PER_ITEM", freightRateQuantity: D(4) },
  kgShipment
);
check(
  "per kg → per piece: unit, switched, quantity",
  [switchedToPiece.ratePerItem, switchedToPiece.unitSwitched, switchedToPiece.ratePricedOn],
  [true, true, 4]
);
const sameUnit = rateFactsOf(
  { freightRateOverride: D(11.5), freightRateMethod: "WEIGHT_BASED", freightRateQuantity: D(3.8) },
  kgShipment
);
check("agreed rate in the book's unit: not a switch", sameUnit.unitSwitched, false);
const legacy = rateFactsOf({ freightRateOverride: D(11.5) }, kgShipment);
check(
  "rate agreed before units were stored: book's unit",
  [legacy.ratePerItem, legacy.unitSwitched, legacy.ratePricedOn, legacy.agreedQuantity],
  [false, false, 3.8, null]
);
const cleared = rateFactsOf(
  { freightRateOverride: null, freightRateMethod: "WEIGHT_BASED", freightRateQuantity: D(1) },
  docsShipment
);
check(
  "no rate on the bill: no switch, book quantity",
  [cleared.unitSwitched, cleared.ratePricedOn, cleared.agreedQuantity],
  [false, 2, null]
);

await wipe();
console.log(bad === 0 ? "\nAll rate-switch cases correct." : `\n${bad} FAILED`);
await prisma.$disconnect();
process.exit(bad === 0 ? 0 : 1);
