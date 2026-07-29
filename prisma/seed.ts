/**
 * Seed.
 *
 * Creates the CEO account plus one member of each department, and a set of
 * shipments spread across every stage of the workflow so each dashboard has
 * something real to show on first run.
 *
 * Safe to re-run: users and settings are upserted, and demo cargo is only
 * created when the database has none.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const qrToken = () => `TXQ${randomBytes(20).toString("base64url")}`;

async function seq(key: string) {
  const counter = await prisma.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}

const pad = (n: number, w = 6) => String(n).padStart(w, "0");

async function main() {
  const year = new Date().getFullYear();

  // ---------------------------------------------------------------- settings
  await prisma.setting.upsert({
    where: { key: "pricing.defaultRatePerKg" },
    create: { key: "pricing.defaultRatePerKg", value: "13000" },
    update: {},
  });

  // ------------------------------------------------------------------- staff
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL ?? "ceo@targetexpress.co.tz"
  ).toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Add it to .env before seeding."
    );
  }

  const hash = (pw: string) => bcrypt.hash(pw, 12);

  const ceo = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      name: "Managing Director",
      email: adminEmail,
      passwordHash: await hash(adminPassword),
      role: "ADMIN",
      department: "MANAGEMENT",
    },
    update: {},
  });

  const staffSpec = [
    {
      name: "Guangzhou Desk",
      email: "china@targetexpress.co.tz",
      role: "CHINA_WAREHOUSE" as const,
      department: "CHINA_WAREHOUSE" as const,
    },
    {
      name: "Dar Warehouse",
      email: "warehouse@targetexpress.co.tz",
      role: "DAR_WAREHOUSE" as const,
      department: "DAR_WAREHOUSE" as const,
    },
    {
      name: "Finance Office",
      email: "finance@targetexpress.co.tz",
      role: "FINANCE" as const,
      department: "FINANCE" as const,
    },
  ];

  const staff: Record<string, string> = {};
  for (const spec of staffSpec) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      create: {
        name: spec.name,
        email: spec.email,
        passwordHash: await hash(adminPassword),
        role: spec.role,
        department: spec.department,
        createdById: ceo.id,
      },
      update: {},
    });
    staff[spec.role] = user.id;
  }

  const china = staff.CHINA_WAREHOUSE;
  const dar = staff.DAR_WAREHOUSE;
  const finance = staff.FINANCE;

  console.log(`Staff ready: ${adminEmail} + ${staffSpec.length} department accounts`);

  // Demo cargo only on a fresh database — never on top of real operations.
  const existing = await prisma.shipment.count();
  if (existing > 0) {
    console.log(`Skipping demo cargo — ${existing} shipment(s) already exist.`);
    return;
  }

  // --------------------------------------------------------------- customers
  const customerSpec = [
    { name: "Kariakoo Traders Ltd", phone: "+255762111222", city: "Dar es Salaam" },
    { name: "Mwanza Phone Hub", phone: "+255713444555", city: "Mwanza" },
    { name: "Arusha Fashion House", phone: "+255754777888", city: "Arusha" },
    { name: "Bahati General Supplies", phone: "+255786999000", city: "Dodoma" },
    { name: "Zanzibar Beauty Store", phone: "+255778222333", city: "Zanzibar" },
  ];

  const customers = [];
  for (const spec of customerSpec) {
    customers.push(
      await prisma.customer.create({
        data: {
          code: `CUS-${pad(await seq("customer"))}`,
          name: spec.name,
          phone: spec.phone,
          city: spec.city,
          createdById: china,
        },
      })
    );
  }

  // ----------------------------------------------------------------- batches
  // batchNumber is minted here, so callers must not supply one.
  const mkBatch = async (
    data: Omit<Prisma.BatchUncheckedCreateInput, "batchNumber">
  ) =>
    prisma.batch.create({
      data: {
        ...data,
        batchNumber: `BATCH-${year}-${pad(await seq(`batch:${year}`), 3)}`,
      },
    });

  const closedBatch = await mkBatch({
    origin: "GUANGZHOU",
    status: "VERIFIED",
    airline: "Ethiopian Airlines",
    flightNumber: "ET 8611",
    waybillNumber: "071-45889231",
    departureDate: daysAgo(21),
    departedAt: daysAgo(21),
    arrivalDate: daysAgo(18),
    arrivedAt: daysAgo(18),
    verifiedAt: daysAgo(18),
    createdById: china,
    createdAt: daysAgo(26),
  });

  const arrivedBatch = await mkBatch({
    origin: "GUANGZHOU",
    status: "ARRIVED",
    airline: "Emirates SkyCargo",
    flightNumber: "EK 9821",
    waybillNumber: "176-33920114",
    departureDate: daysAgo(4),
    departedAt: daysAgo(4),
    arrivalDate: daysAgo(1),
    arrivedAt: daysAgo(1),
    createdById: china,
    createdAt: daysAgo(9),
  });

  const transitBatch = await mkBatch({
    origin: "HONG_KONG",
    status: "IN_TRANSIT",
    airline: "Qatar Airways Cargo",
    flightNumber: "QR 8142",
    waybillNumber: "157-88213076",
    departureDate: daysAgo(1),
    departedAt: daysAgo(1),
    createdById: china,
    createdAt: daysAgo(6),
  });

  const openBatch = await mkBatch({
    origin: "GUANGZHOU",
    status: "OPEN",
    notes: "Targeting the Thursday freighter.",
    createdById: china,
    createdAt: daysAgo(2),
  });

  // ---------------------------------------------------------------- shipments
  type Spec = {
    customer: number;
    goodsType: Prisma.ShipmentUncheckedCreateInput["goodsType"];
    description: string;
    packages: number;
    weightKg: number;
    batchId: string | null;
    status: Prisma.ShipmentUncheckedCreateInput["status"];
    origin: "GUANGZHOU" | "HONG_KONG";
    registeredDaysAgo: number;
  };

  const rate = 13000;

  const specs: Spec[] = [
    // Completed journey
    {
      customer: 0,
      goodsType: "GENERAL_MERCHANDISE",
      description: "Assorted general goods",
      packages: 6,
      weightKg: 148.5,
      batchId: closedBatch.id,
      status: "DELIVERED",
      origin: "GUANGZHOU",
      registeredDaysAgo: 26,
    },
    {
      customer: 1,
      goodsType: "PHONE_ACCESSORIES",
      description: "Mobile phone accessories",
      packages: 3,
      weightKg: 62.25,
      batchId: closedBatch.id,
      status: "DELIVERED",
      origin: "GUANGZHOU",
      registeredDaysAgo: 25,
    },
    // Arrived, checked in, paid — waiting at the counter
    {
      customer: 2,
      goodsType: "TEXTILES_GARMENTS",
      description: "Ladies' clothing",
      packages: 8,
      weightKg: 211,
      batchId: arrivedBatch.id,
      status: "READY_FOR_PICKUP",
      origin: "GUANGZHOU",
      registeredDaysAgo: 9,
    },
    // Arrived, checked in, unpaid — the chase list
    {
      customer: 3,
      goodsType: "MACHINERY_PARTS",
      description: "Water pump spare parts",
      packages: 2,
      weightKg: 94.8,
      batchId: arrivedBatch.id,
      status: "RECEIVED_AT_DAR",
      origin: "GUANGZHOU",
      registeredDaysAgo: 8,
    },
    // Arrived but not yet checked in (the Dar to-do list)
    {
      customer: 4,
      goodsType: "COSMETICS",
      description: "Human hair & beauty products",
      packages: 5,
      weightKg: 77.4,
      batchId: arrivedBatch.id,
      status: "IN_TRANSIT",
      origin: "GUANGZHOU",
      registeredDaysAgo: 8,
    },
    // In the air
    {
      customer: 0,
      goodsType: "FOOTWEAR",
      description: "Shoes / sneakers",
      packages: 12,
      weightKg: 305.2,
      batchId: transitBatch.id,
      status: "IN_TRANSIT",
      origin: "HONG_KONG",
      registeredDaysAgo: 6,
    },
    {
      customer: 1,
      goodsType: "ELECTRONICS",
      description: "LED lighting",
      packages: 4,
      weightKg: 118,
      batchId: transitBatch.id,
      status: "IN_TRANSIT",
      origin: "HONG_KONG",
      registeredDaysAgo: 5,
    },
    // Sitting in China
    {
      customer: 2,
      goodsType: "STATIONERY",
      description: "Office stationery",
      packages: 3,
      weightKg: 41.6,
      batchId: openBatch.id,
      status: "READY_TO_DEPART",
      origin: "GUANGZHOU",
      registeredDaysAgo: 2,
    },
    {
      customer: 3,
      goodsType: "AUTO_SPARES",
      description: "Motorcycle spare parts",
      packages: 7,
      weightKg: 189.35,
      batchId: openBatch.id,
      status: "READY_TO_DEPART",
      origin: "GUANGZHOU",
      registeredDaysAgo: 1,
    },
    {
      customer: 4,
      goodsType: "FURNITURE_FITTINGS",
      description: "Kitchen fittings",
      packages: 2,
      weightKg: 66,
      batchId: null,
      status: "READY_TO_DEPART",
      origin: "GUANGZHOU",
      registeredDaysAgo: 0,
    },
  ];

  const created: { id: string; trackingNumber: string; spec: Spec }[] = [];

  for (const spec of specs) {
    const registeredAt = daysAgo(spec.registeredDaysAgo);
    const batch =
      spec.batchId === closedBatch.id
        ? closedBatch
        : spec.batchId === arrivedBatch.id
          ? arrivedBatch
          : spec.batchId === transitBatch.id
            ? transitBatch
            : null;

    const departedAt =
      spec.status === "READY_TO_DEPART" ? null : (batch?.departedAt ?? null);
    const arrivedAt =
      spec.status === "RECEIVED_AT_DAR" ||
      spec.status === "READY_FOR_PICKUP" ||
      spec.status === "DELIVERED"
        ? (batch?.arrivedAt ?? null)
        : null;
    const readyForPickup =
      spec.status === "READY_FOR_PICKUP" || spec.status === "DELIVERED"
        ? daysAgo(spec.status === "DELIVERED" ? 17 : 1)
        : null;
    const deliveredAt = spec.status === "DELIVERED" ? daysAgo(16) : null;

    const shipment = await prisma.shipment.create({
      data: {
        trackingNumber: `TX-${pad(await seq("shipment"))}`,
        qrToken: qrToken(),
        customerId: customers[spec.customer].id,
        goodsType: spec.goodsType,
        description: spec.description,
        packages: spec.packages,
        weightKg: new Prisma.Decimal(spec.weightKg),
        origin: spec.origin,
        unitRate: new Prisma.Decimal(rate),
        batchId: spec.batchId,
        status: spec.status,
        registeredAt,
        departedAt,
        arrivedAt,
        readyForPickup,
        deliveredAt,
        createdById: china,
        createdAt: registeredAt,
      },
    });

    // Status history mirrors the stamps above, in order.
    const history: Prisma.ShipmentStatusHistoryUncheckedCreateInput[] = [
      {
        shipmentId: shipment.id,
        toStatus: "READY_TO_DEPART",
        location: spec.origin === "GUANGZHOU" ? "Guangzhou, China" : "Hong Kong",
        note: "Cargo received and registered at the China warehouse.",
        actorId: china,
        createdAt: registeredAt,
      },
    ];
    if (departedAt) {
      history.push({
        shipmentId: shipment.id,
        fromStatus: "READY_TO_DEPART",
        toStatus: "IN_TRANSIT",
        location: "China → Tanzania",
        note: `Departed on ${batch?.airline} ${batch?.flightNumber} (waybill ${batch?.waybillNumber}).`,
        actorId: china,
        createdAt: departedAt,
      });
    }
    if (arrivedAt) {
      history.push({
        shipmentId: shipment.id,
        fromStatus: "IN_TRANSIT",
        toStatus: "RECEIVED_AT_DAR",
        location: "Dar es Salaam warehouse",
        note: "Checked in against the batch manifest.",
        actorId: dar,
        createdAt: arrivedAt,
      });
    }
    if (readyForPickup) {
      history.push({
        shipmentId: shipment.id,
        fromStatus: "RECEIVED_AT_DAR",
        toStatus: "READY_FOR_PICKUP",
        location: "Dar es Salaam warehouse",
        note: "Payment confirmed. Pickup note issued.",
        actorId: finance,
        createdAt: readyForPickup,
      });
    }
    if (deliveredAt) {
      history.push({
        shipmentId: shipment.id,
        fromStatus: "READY_FOR_PICKUP",
        toStatus: "DELIVERED",
        location: "Collected by customer",
        note: "Released to the customer against a valid pickup note.",
        actorId: dar,
        createdAt: deliveredAt,
      });
    }
    await prisma.shipmentStatusHistory.createMany({ data: history });

    // Arrival verification for everything the Dar team has checked in.
    if (arrivedAt && spec.batchId) {
      await prisma.batchVerification.create({
        data: {
          batchId: spec.batchId,
          shipmentId: shipment.id,
          result: "VERIFIED",
          verifiedById: dar,
          verifiedAt: arrivedAt,
        },
      });
    }

    created.push({
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      spec,
    });
  }

  // ------------------------------------------------------------------ money
  for (const entry of created) {
    const needsInvoice =
      entry.spec.status === "RECEIVED_AT_DAR" ||
      entry.spec.status === "READY_FOR_PICKUP" ||
      entry.spec.status === "DELIVERED";
    if (!needsInvoice) continue;

    const total = Math.round(entry.spec.weightKg * rate);
    const settled =
      entry.spec.status === "READY_FOR_PICKUP" ||
      entry.spec.status === "DELIVERED";

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${year}-${pad(await seq(`invoice:${year}`))}`,
        shipmentId: entry.id,
        customerId: customers[entry.spec.customer].id,
        freightCost: new Prisma.Decimal(total),
        total: new Prisma.Decimal(total),
        amountPaid: new Prisma.Decimal(settled ? total : 0),
        status: settled ? "PAID" : "UNPAID",
        issuedById: finance,
      },
    });

    if (!settled) continue;

    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: new Prisma.Decimal(total),
        method: entry.spec.status === "DELIVERED" ? "CASH" : "MOBILE_MONEY",
        reference:
          entry.spec.status === "DELIVERED"
            ? null
            : `MP${randomBytes(4).toString("hex").toUpperCase()}`,
        receivedById: finance,
        paidAt: daysAgo(entry.spec.status === "DELIVERED" ? 17 : 1),
      },
    });

    await prisma.receipt.create({
      data: {
        receiptNumber: `RCT-${year}-${pad(await seq(`receipt:${year}`))}`,
        paymentId: payment.id,
        issuedById: finance,
      },
    });

    const note = await prisma.pickupNote.create({
      data: {
        noteNumber: `PN-${year}-${pad(await seq(`pickup:${year}`))}`,
        shipmentId: entry.id,
        customerId: customers[entry.spec.customer].id,
        amountPaid: new Prisma.Decimal(total),
        status: entry.spec.status === "DELIVERED" ? "USED" : "ACTIVE",
        usedAt: entry.spec.status === "DELIVERED" ? daysAgo(16) : null,
        issuedById: finance,
        issuedAt: daysAgo(entry.spec.status === "DELIVERED" ? 17 : 1),
      },
    });

    if (entry.spec.status === "DELIVERED") {
      const customer = customers[entry.spec.customer];
      await prisma.deliveryRecord.create({
        data: {
          shipmentId: entry.id,
          pickupNoteId: note.id,
          receiverName: customer.name,
          receiverPhone: customer.phone,
          relationship: "SELF",
          releasedById: dar,
          releasedAt: daysAgo(16),
        },
      });
    }
  }

  // -------------------------------------------------------------- exception
  const damaged = created.find((c) => c.spec.status === "RECEIVED_AT_DAR");
  if (damaged) {
    await prisma.shipmentException.create({
      data: {
        shipmentId: damaged.id,
        batchId: arrivedBatch.id,
        type: "DAMAGED_CARGO",
        description:
          "One carton arrived with a torn corner. Contents counted and complete; customer informed.",
        raisedById: dar,
        raisedAt: daysAgo(1),
      },
    });
  }

  // ------------------------------------------------------------------ audit
  await prisma.auditLog.create({
    data: {
      actorId: ceo.id,
      actorEmail: ceo.email,
      actorRole: "ADMIN",
      action: "system.seed",
      entity: "System",
      summary: `Seeded ${created.length} demo shipments across 4 batches`,
    },
  });

  console.log(
    `Seeded ${customers.length} customers, 4 batches and ${created.length} shipments.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
