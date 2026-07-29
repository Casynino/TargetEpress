import "server-only";

import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/** Counts the China desk cares about. */
export async function chinaStats() {
  const [readyToDepart, openBatches, inTransitBatches, registeredThisWeek, weight] =
    await Promise.all([
      prisma.shipment.count({ where: { status: "READY_TO_DEPART" } }),
      prisma.batch.count({ where: { status: "OPEN" } }),
      prisma.batch.count({ where: { status: "IN_TRANSIT" } }),
      prisma.shipment.count({
        where: {
          registeredAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
        },
      }),
      prisma.shipment.aggregate({
        where: { status: "READY_TO_DEPART" },
        _sum: { weightKg: true },
      }),
    ]);

  return {
    readyToDepart,
    openBatches,
    inTransitBatches,
    registeredThisWeek,
    stagedWeightKg: toNumber(weight._sum.weightKg),
  };
}

/** Counts the Dar warehouse cares about. */
export async function darStats() {
  const [incoming, awaitingCheck, inWarehouse, readyForPickup, openExceptions] =
    await Promise.all([
      prisma.batch.count({ where: { status: "IN_TRANSIT" } }),
      prisma.batch.count({ where: { status: "ARRIVED" } }),
      prisma.shipment.count({ where: { status: "RECEIVED_AT_DAR" } }),
      prisma.shipment.count({ where: { status: "READY_FOR_PICKUP" } }),
      prisma.shipmentException.count({ where: { status: "OPEN" } }),
    ]);

  return { incoming, awaitingCheck, inWarehouse, readyForPickup, openExceptions };
}

/** Counts Finance cares about. */
export async function financeStats() {
  const [unpaid, partiallyPaid, awaitingInvoice, activeNotes, paidAgg, outstandingAgg] =
    await Promise.all([
      prisma.invoice.count({ where: { status: "UNPAID" } }),
      prisma.invoice.count({ where: { status: "PARTIALLY_PAID" } }),
      prisma.shipment.count({
        where: {
          invoice: null,
          status: { in: ["RECEIVED_AT_DAR", "IN_TRANSIT"] },
        },
      }),
      prisma.pickupNote.count({ where: { status: "ACTIVE" } }),
      prisma.invoice.aggregate({
        where: { status: { not: "VOID" } },
        _sum: { amountPaid: true },
      }),
      prisma.invoice.aggregate({
        where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
        _sum: { total: true, amountPaid: true },
      }),
    ]);

  const collected = toNumber(paidAgg._sum.amountPaid);
  const outstanding =
    toNumber(outstandingAgg._sum.total) - toNumber(outstandingAgg._sum.amountPaid);

  return {
    unpaid,
    partiallyPaid,
    awaitingInvoice,
    activeNotes,
    collected,
    outstanding,
  };
}

/** The CEO's whole-business view. */
export async function executiveStats() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    active,
    inTransit,
    inWarehouse,
    deliveredThisMonth,
    activeBatches,
    openExceptions,
    staff,
    customers,
    revenueThisMonth,
    allTimeCollected,
    outstandingAgg,
  ] = await Promise.all([
    prisma.shipment.count({
      where: { status: { notIn: ["DELIVERED", "CANCELLED"] } },
    }),
    prisma.shipment.count({ where: { status: "IN_TRANSIT" } }),
    prisma.shipment.count({
      where: { status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP"] } },
    }),
    prisma.shipment.count({
      where: { status: "DELIVERED", deliveredAt: { gte: monthStart } },
    }),
    prisma.batch.count({
      where: { status: { in: ["OPEN", "READY_TO_DEPART", "IN_TRANSIT", "ARRIVED"] } },
    }),
    prisma.shipmentException.count({ where: { status: "OPEN" } }),
    prisma.user.count({ where: { active: true } }),
    prisma.customer.count(),
    prisma.payment.aggregate({
      where: { paidAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.invoice.aggregate({
      where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      _sum: { total: true, amountPaid: true },
    }),
  ]);

  return {
    active,
    inTransit,
    inWarehouse,
    deliveredThisMonth,
    activeBatches,
    openExceptions,
    staff,
    customers,
    revenueThisMonth: toNumber(revenueThisMonth._sum.amount),
    allTimeCollected: toNumber(allTimeCollected._sum.amount),
    outstanding:
      toNumber(outstandingAgg._sum.total) - toNumber(outstandingAgg._sum.amountPaid),
  };
}

export async function recentActivity(limit = 12) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      summary: true,
      action: true,
      createdAt: true,
      actorEmail: true,
      actor: { select: { name: true } },
    },
  });
}

/**
 * Shipments that have been sitting in the Dar warehouse unpaid the longest —
 * the single most useful list for both Finance and the CEO.
 */
export async function agingInWarehouse(limit = 8) {
  return prisma.shipment.findMany({
    where: { status: "RECEIVED_AT_DAR" },
    orderBy: { arrivedAt: "asc" },
    take: limit,
    select: {
      id: true,
      trackingNumber: true,
      arrivedAt: true,
      customer: { select: { name: true, phone: true } },
      invoice: { select: { total: true, amountPaid: true, currency: true } },
    },
  });
}
