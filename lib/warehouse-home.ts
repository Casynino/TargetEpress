import "server-only";

import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * Today, in the five numbers the warehouse banner shows.
 *
 * Deliberately small. An earlier version of this file fed a whole command
 * centre — progress rings, feeds, insights — and the screen it produced buried
 * the two things people actually open the dashboard for: the batches and the
 * volume chart. What is left is what belongs in a banner.
 */

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export type TodaySummary = {
  shipments: number;
  weightKg: number;
  packages: number;
  photos: number;
  labelsPrinted: number;
  awaitingDispatch: number;
};

export async function todaySummary(): Promise<TodaySummary> {
  const since = startOfToday();
  const [cargo, photos, labels, waiting] = await Promise.all([
    prisma.shipment.aggregate({
      where: { registeredAt: { gte: since } },
      _count: true,
      _sum: { weightKg: true, packages: true },
    }),
    prisma.shipmentPhoto.count({ where: { createdAt: { gte: since } } }),
    prisma.auditLog.count({
      where: { action: "label.print", createdAt: { gte: since } },
    }),
    prisma.shipment.count({ where: { status: "READY_TO_DEPART" } }),
  ]);

  return {
    shipments: cargo._count,
    weightKg: toNumber(cargo._sum.weightKg ?? 0),
    packages: cargo._sum.packages ?? 0,
    photos,
    labelsPrinted: labels,
    awaitingDispatch: waiting,
  };
}
