/**
 * Put every flight on one numbering scheme, and make its origin tell the truth.
 *
 *   npx tsx scripts/fix-batch-numbering.mts            # say what would change
 *   npx tsx scripts/fix-batch-numbering.mts --apply    # change it
 *
 * Two faults, one cause. The app minted batch numbers three different ways —
 * BATCH-2026-001 from the batch form, GZ-SHIP-2026-001 from a dispatch, and
 * whatever the operator typed at an import — so the board read like three
 * different systems. And because the packing-list importer took the airport as
 * a separate flag that defaulted to Guangzhou, a flight typed in as HK/26-13
 * was stored as a Guangzhou flight, along with every consignment on it.
 *
 * Both are fixed at the source (lib/ids.ts mints one shape; the importer now
 * reads the airport out of the number). This script repairs what was already
 * written:
 *
 *   1. Any batch whose number is not a flight number is renumbered into the
 *      scheme, keeping its airport and taking the next free number in that
 *      airport's run for its year. The old number is kept in the notes and in
 *      the audit log, because it is on paperwork that already left the office.
 *   2. Any batch whose stored origin disagrees with its own number is corrected
 *      to what the number says — the number is the one the office wrote on the
 *      packing list, the origin is the one a default guessed at.
 *   3. Every consignment inherits its batch's corrected origin, since the
 *      schema says a shipment's origin must match the batch it is on.
 *   4. The counters are set past the highest number in use, so the next flight
 *      continues the office's real run instead of restarting at 01.
 *
 * No money moves. The rate book is keyed on what the goods ARE — category and
 * cargo type — never on the airport, so correcting an origin cannot change a
 * quote, an invoice or a payment. That is asserted at the end, not assumed.
 */
import { PrismaClient, type Origin } from "@prisma/client";

import {
  batchNumberFor,
  batchPrefix,
  originFromBatchNumber,
  sequenceFromBatchNumber,
} from "../lib/cargo";
import { ORIGIN_LABELS } from "../lib/constants";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/** The two permanent loading tables are not flights and keep their names. */
const LOADING = new Set(["GZ-LOADING", "HK-LOADING"]);

async function main() {
  const batches = await prisma.batch.findMany({
    select: {
      id: true,
      batchNumber: true,
      origin: true,
      permanent: true,
      notes: true,
      createdAt: true,
      departureDate: true,
      arrivalDate: true,
      _count: { select: { shipments: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });

  /*
    Where each location's run has already reached.

    Read from the numbers themselves, including the old GZ/26-28 notation, so a
    batch keeps its place: the 28th Guangzhou load stays the 28th and becomes
    GZ-0028. Renumbering it to whatever happened to be free would break every
    reference to it on paper.
  */
  const highest = new Map<string, number>();
  const taken = new Set<string>();
  for (const b of batches) {
    const seq = sequenceFromBatchNumber(b.batchNumber);
    const from = originFromBatchNumber(b.batchNumber);
    if (seq === null || from === null) continue;
    const prefix = batchPrefix(from);
    highest.set(prefix, Math.max(highest.get(prefix) ?? 0, seq));
    taken.add(batchNumberFor(from, seq));
  }

  const renumbers: { id: string; from: string; to: string; origin: Origin }[] = [];
  const originFixes: {
    id: string;
    batchNumber: string;
    from: Origin;
    to: Origin;
    pieces: number;
  }[] = [];

  for (const b of batches) {
    if (LOADING.has(b.batchNumber)) continue;

    const fromNumber = originFromBatchNumber(b.batchNumber);

    if (fromNumber === null) {
      /*
        Says nothing about where it loaded. Keep the location that is stored —
        it is all there is to go on — and give it the next number in that
        location's run.
      */
      if (b.permanent) continue; // a loading table under some other name
      const prefix = batchPrefix(b.origin);
      const next = (highest.get(prefix) ?? 0) + 1;
      highest.set(prefix, next);
      const to = batchNumberFor(b.origin, next);
      taken.add(to);
      renumbers.push({ id: b.id, from: b.batchNumber, to, origin: b.origin });
      continue;
    }

    /* On the scheme's sequence but in the old notation: GZ/26-28 -> GZ-0028. */
    const wanted = batchNumberFor(fromNumber, sequenceFromBatchNumber(b.batchNumber)!);
    if (wanted !== b.batchNumber) {
      renumbers.push({ id: b.id, from: b.batchNumber, to: wanted, origin: fromNumber });
    }

    if (fromNumber !== b.origin) {
      originFixes.push({
        id: b.id,
        batchNumber: b.batchNumber,
        from: b.origin,
        to: fromNumber,
        pieces: b._count.shipments,
      });
    }
  }

  console.log(`${batches.length} batch(es) on file.\n`);

  console.log("RENUMBER — brought onto the scheme:");
  if (renumbers.length === 0) console.log("  (none)");
  for (const r of renumbers)
    console.log(`  ${r.from.padEnd(22)} -> ${r.to}   (${ORIGIN_LABELS[r.origin]})`);

  console.log("\nORIGIN — the number disagreed with the stored airport:");
  if (originFixes.length === 0) console.log("  (none)");
  for (const f of originFixes)
    console.log(
      `  ${f.batchNumber.padEnd(22)} ${ORIGIN_LABELS[f.from]} -> ${ORIGIN_LABELS[f.to]}` +
        `   (and ${f.pieces} consignment(s))`
    );

  // What the counters must become so nothing is ever minted twice.
  const counters = new Map<string, number>();
  for (const [prefix, value] of highest) counters.set(`batch:${prefix}`, value);
  console.log("\nCOUNTERS — each location continues its own run from here:");
  for (const [key, value] of counters) {
    const prefix = key.split(":")[1];
    const route: Origin = prefix === "HK" ? "HONG_KONG" : "GUANGZHOU";
    console.log(
      `  ${key.padEnd(14)} = ${value}   next: ${batchNumberFor(route, value + 1)}`
    );
  }

  if (!APPLY) {
    console.log("\nNothing was written. Re-run with --apply to make these changes.");
    await prisma.$disconnect();
    return;
  }

  // ---------------------------------------------------------------- apply
  const moneyBefore = await moneySnapshot();

  for (const r of renumbers) {
    await prisma.$transaction(async (tx) => {
      const before = await tx.batch.findUniqueOrThrow({
        where: { id: r.id },
        select: { notes: true },
      });
      await tx.batch.update({
        where: { id: r.id },
        data: {
          batchNumber: r.to,
          notes: [before.notes, `Renumbered from ${r.from} onto the batch-number scheme.`]
            .filter(Boolean)
            .join(" "),
        },
      });
      await tx.fieldChange.create({
        data: {
          entity: "Batch",
          entityId: r.id,
          field: "Batch number",
          before: r.from,
          after: r.to,
          actorId: admin?.id ?? null,
          actorName: "Numbering correction",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin?.id ?? null,
          actorEmail: admin?.email ?? null,
          actorRole: admin ? "ADMIN" : null,
          action: "batch.renumbered",
          entity: "Batch",
          entityId: r.id,
          summary:
            `${r.from} is now ${r.to} — one numbering scheme for every batch. ` +
            "The old number stays in this batch's notes because it is on paperwork already issued.",
          metadata: { from: r.from, to: r.to, script: "scripts/fix-batch-numbering.mts" },
        },
      });
    });
  }

  for (const f of originFixes) {
    await prisma.$transaction(async (tx) => {
      await tx.batch.update({ where: { id: f.id }, data: { origin: f.to } });

      const pieces = await tx.shipment.findMany({
        where: { batchId: f.id, origin: { not: f.to } },
        select: { id: true },
      });
      if (pieces.length > 0) {
        await tx.shipment.updateMany({
          where: { batchId: f.id },
          data: { origin: f.to },
        });
        await tx.fieldChange.createMany({
          data: pieces.map((p) => ({
            entity: "Shipment",
            entityId: p.id,
            field: "Origin",
            before: ORIGIN_LABELS[f.from],
            after: ORIGIN_LABELS[f.to],
            actorId: admin?.id ?? null,
            actorName: "Origin correction",
          })),
        });
      }

      await tx.fieldChange.create({
        data: {
          entity: "Batch",
          entityId: f.id,
          field: "Origin",
          before: ORIGIN_LABELS[f.from],
          after: ORIGIN_LABELS[f.to],
          actorId: admin?.id ?? null,
          actorName: "Origin correction",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: admin?.id ?? null,
          actorEmail: admin?.email ?? null,
          actorRole: admin ? "ADMIN" : null,
          action: "batch.origin.corrected",
          entity: "Batch",
          entityId: f.id,
          summary:
            `${f.batchNumber} was recorded as loading in ${ORIGIN_LABELS[f.from]} and is a ` +
            `${ORIGIN_LABELS[f.to]} batch, as its number says. Corrected here and on ` +
            `${pieces.length} consignment(s). No price changes: the rate book is keyed on ` +
            "what the goods are, not where they left from.",
          metadata: {
            from: f.from,
            to: f.to,
            pieces: pieces.length,
            script: "scripts/fix-batch-numbering.mts",
          },
        },
      });
    });
  }

  for (const [key, value] of counters) {
    await prisma.counter.upsert({
      where: { key },
      create: { key, value },
      update: { value: Math.max(value, (await prisma.counter.findUnique({ where: { key } }))?.value ?? 0) },
    });
  }

  // ------------------------------------------------------------- assert
  const moneyAfter = await moneySnapshot();
  const moved = Object.entries(moneyAfter).filter(
    ([k, v]) => Math.abs(v - moneyBefore[k as keyof typeof moneyBefore]) > 0.005
  );
  console.log("\nMoney before:", JSON.stringify(moneyBefore));
  console.log("Money after: ", JSON.stringify(moneyAfter));
  console.log(
    moved.length === 0
      ? "Not one figure moved, which is the point."
      : `MOVED: ${moved.map(([k, v]) => `${k} ${moneyBefore[k as keyof typeof moneyBefore]} -> ${v}`).join(", ")}`
  );

  const left = await prisma.batch.findMany({
    select: { batchNumber: true, origin: true, permanent: true },
  });
  const wrong = left.filter(
    (b) =>
      !LOADING.has(b.batchNumber) &&
      !b.permanent &&
      originFromBatchNumber(b.batchNumber) !== b.origin
  );
  console.log(
    wrong.length === 0
      ? "Every batch number now agrees with where it loaded."
      : `STILL WRONG: ${wrong.map((b) => b.batchNumber).join(", ")}`
  );

  await prisma.$disconnect();
}

/** Every total that must be identical before and after. */
async function moneySnapshot() {
  const [invoices, payments, quotes] = await Promise.all([
    prisma.invoice.aggregate({
      _sum: { total: true, amountPaid: true, freightCost: true, discount: true },
    }),
    // creditedAmount is the figure that settles a bill, whatever the customer
    // handed over it in.
    prisma.payment.aggregate({ _sum: { amount: true, creditedAmount: true } }),
    prisma.shipment.aggregate({ _sum: { quotedAmount: true } }),
  ]);
  return {
    invoiced: Number(invoices._sum.total ?? 0),
    paid: Number(invoices._sum.amountPaid ?? 0),
    freight: Number(invoices._sum.freightCost ?? 0),
    discounts: Number(invoices._sum.discount ?? 0),
    paidIn: Number(payments._sum.amount ?? 0),
    credited: Number(payments._sum.creditedAmount ?? 0),
    quoted: Number(quotes._sum.quotedAmount ?? 0),
  };
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
