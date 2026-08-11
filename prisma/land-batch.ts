/**
 * Fly a batch to Dar, check it in, and leave every consignment billed and
 * waiting for the customer's money.
 *
 *   npx tsx --conditions=react-server prisma/land-batch.ts \
 *     --batch GZ/26-28 --waybill 176-44821905 --airline "Ethiopian Airlines" \
 *     --flight ET605 --departed 2026-07-31 --arrived 2026-08-02 [--commit]
 *
 * import-packing-list.ts creates the China side: customers, consignments,
 * per-package QR labels, an open batch. It stops there, correctly — that is
 * where Guangzhou's job ends. This walks the same batch through everything the
 * Dar floor and Finance would do to it, in the same order and through the same
 * code, so the result is indistinguishable from cargo that really flew:
 *
 *   seal & dispatch  ->  land  ->  check in every package  ->  verify the batch
 *   ->  auto-price (drafts)  ->  Finance confirms (bills)
 *
 * The pricing is not reimplemented here. It calls the same `quote()` the app
 * calls and repeats confirmPrice's arithmetic, including re-deriving storage
 * days and today's exchange rate — a seed that priced cargo its own way would
 * be a second rate book nobody maintains.
 *
 * Dry unless --commit, and it prints the database it is pointed at first.
 */

import { Prisma } from "@prisma/client";

import { STORAGE_POLICY, storageDaysFor } from "../lib/constants";
import { toNumber } from "../lib/format";
import { LOCAL_CURRENCY, currentRateValue, toLocal } from "../lib/fx";
import { autoPriceShipments } from "../lib/auto-price";
import { quote } from "../lib/pricing";
import { prisma } from "../lib/prisma";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const COMMIT = process.argv.includes("--commit");

function day(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(`${value}T09:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`--${value} is not a date.`);
  return d;
}

async function main() {
  const batchNumber = arg("batch");
  if (!batchNumber) {
    throw new Error(
      'Usage: npx tsx --conditions=react-server prisma/land-batch.ts --batch GZ/26-28 [--commit]'
    );
  }

  const url = process.env.DATABASE_URL ?? "";
  console.log(`\nDatabase: ${(url.match(/@([^/:?]+)/) ?? [])[1] ?? "?"}`);
  console.log(COMMIT ? "Mode:     COMMIT — this writes\n" : "Mode:     dry run\n");

  const batch = await prisma.batch.findUnique({
    where: { batchNumber },
    select: {
      id: true,
      batchNumber: true,
      origin: true,
      status: true,
      permanent: true,
      shipments: {
        where: { deletedAt: null },
        select: {
          id: true,
          trackingNumber: true,
          status: true,
          weightKg: true,
          packages: true,
          packageList: { select: { id: true, receivedAt: true } },
          invoice: { select: { id: true, status: true } },
        },
      },
    },
  });

  if (!batch) throw new Error(`No batch numbered ${batchNumber}.`);
  if (batch.permanent) throw new Error("That is a loading table, not a flight.");
  if (batch.shipments.length === 0) throw new Error("That batch has no cargo on it.");

  const staff = await prisma.user.findMany({
    where: { role: { in: ["DAR_WAREHOUSE", "ADMIN"] } },
    select: { id: true, name: true, role: true },
    orderBy: { role: "asc" },
  });
  const dar = staff.find((s) => s.role === "DAR_WAREHOUSE") ?? staff[0];
  if (!dar) throw new Error("No Dar warehouse or admin account to attribute this to.");

  const packages = batch.shipments.flatMap((s) => s.packageList);
  const departedAt = day(arg("departed"), new Date(Date.now() - 5 * 864e5));
  const arrivedAt = day(arg("arrived"), new Date(Date.now() - 3 * 864e5));

  console.log(`${batch.batchNumber} · ${batch.origin} · now ${batch.status}`);
  console.log(`  ${batch.shipments.length} consignment(s), ${packages.length} package(s)`);
  console.log(`  checked in by ${dar.name}`);
  console.log(`  departs ${departedAt.toISOString().slice(0, 10)}, lands ${arrivedAt.toISOString().slice(0, 10)}`);

  if (!COMMIT) {
    console.log("\nWould: dispatch, land, check in every package, verify, price, and confirm.");
    console.log("Re-run with --commit.");
    return;
  }

  const ids = batch.shipments.map((s) => s.id);

  // --- the flight ---------------------------------------------------------
  await prisma.$transaction(async (tx) => {
    await tx.batch.update({
      where: { id: batch.id },
      data: {
        status: "VERIFIED",
        waybillNumber: arg("waybill") ?? null,
        airline: arg("airline") ?? null,
        flightNumber: arg("flight") ?? null,
        departureDate: departedAt,
        departedAt,
        arrivalDate: arrivedAt,
        arrivedAt,
        verifiedAt: arrivedAt,
      },
    });

    await tx.shipment.updateMany({
      where: { id: { in: ids } },
      data: { status: "RECEIVED_AT_DAR", departedAt, arrivedAt },
    });

    // Every box ticked off the manifest. A shipment stays short until each of
    // its packages has this, and the release refuses a short shipment.
    await tx.package.updateMany({
      where: { id: { in: packages.map((p) => p.id) } },
      data: { receivedAt: arrivedAt, receivedById: dar.id },
    });

    await tx.batchVerification.createMany({
      data: ids.map((shipmentId) => ({
        batchId: batch.id,
        shipmentId,
        result: "VERIFIED" as const,
        verifiedById: dar.id,
        verifiedAt: arrivedAt,
      })),
      skipDuplicates: true,
    });

    // The public timeline reads off this, so both legs have to be on it.
    await tx.shipmentStatusHistory.createMany({
      data: [
        ...ids.map((shipmentId) => ({
          shipmentId,
          fromStatus: "READY_TO_DEPART" as const,
          toStatus: "IN_TRANSIT" as const,
          location: batch.origin === "HONG_KONG" ? "Hong Kong" : "Guangzhou, China",
          note: `Flew on ${batch.batchNumber}.`,
          actorId: dar.id,
          createdAt: departedAt,
        })),
        ...ids.map((shipmentId) => ({
          shipmentId,
          fromStatus: "IN_TRANSIT" as const,
          toStatus: "RECEIVED_AT_DAR" as const,
          location: "Dar es Salaam, Tanzania",
          note: "Checked in against the manifest.",
          actorId: dar.id,
          createdAt: arrivedAt,
        })),
      ],
    });
  }, { timeout: 120_000 });

  console.log(`\n  landed and checked in ${ids.length} consignment(s), ${packages.length} package(s)`);

  // --- the money ----------------------------------------------------------
  // Same call the check-in makes, so the drafts are the ones the app raises.
  const auto = await autoPriceShipments(ids, dar.id);
  console.log(`  priced ${auto.priced} draft(s), skipped ${auto.skipped}`);
  for (const b of auto.blocked) console.log(`    ! ${b.trackingNumber}: ${b.reason}`);

  // Finance confirming. Repeats confirmPrice: re-derive storage and rate, then
  // the draft becomes a bill the customer can be asked for.
  const drafts = await prisma.invoice.findMany({
    where: { shipmentId: { in: ids }, status: "DRAFT" },
    select: {
      id: true,
      discount: true,
      otherCharges: true,
      freightOverride: true,
      shipment: {
        select: {
          id: true,
          trackingNumber: true,
          cargoCategory: true,
          cargoTypeId: true,
          weightKg: true,
          packages: true,
          arrivedAt: true,
          deliveredAt: true,
        },
      },
    },
  });

  const rate = await currentRateValue();
  let confirmed = 0;
  for (const invoice of drafts) {
    const s = invoice.shipment;
    const priced = await quote({
      category: s.cargoCategory,
      cargoTypeId: s.cargoTypeId,
      weightKg: toNumber(s.weightKg),
      quantity: s.packages,
    });
    if (!priced.ok) {
      console.log(`    ! ${s.trackingNumber} cannot be priced: ${priced.message}`);
      continue;
    }
    const storageDays = storageDaysFor(s.arrivedAt, s.deliveredAt);
    const storageCharge = storageDays * STORAGE_POLICY.perDayUsd;
    const billedFreight =
      invoice.freightOverride === null ? priced.total : toNumber(invoice.freightOverride);
    const total =
      billedFreight + storageCharge + toNumber(invoice.otherCharges) - toNumber(invoice.discount);
    const totalLocal = rate === null ? null : toLocal(total, rate);

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        freightCost: new Prisma.Decimal(priced.total),
        storageDays,
        storageCharge: new Prisma.Decimal(storageCharge),
        total: new Prisma.Decimal(total),
        exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
        localCurrency: LOCAL_CURRENCY,
        totalLocal: totalLocal === null ? null : new Prisma.Decimal(totalLocal),
        status: "UNPAID",
        confirmedAt: new Date(),
        confirmedById: dar.id,
        dueDate: new Date(),
      },
    });
    confirmed++;
  }

  console.log(`  confirmed ${confirmed} bill(s) — customers can now be asked to pay\n`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
