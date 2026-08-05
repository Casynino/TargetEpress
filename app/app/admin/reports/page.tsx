import type { Metadata } from "next";
import { Banknote, Package, Timer, TrendingUp, Truck, Users } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GOODS_TYPE_LABELS, ROLE_LABELS, SHIPMENT_STATUS_META } from "@/lib/constants";
import { formatMoney, formatWeight, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { executiveStats } from "@/lib/queries";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await requirePermission("report.view");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    stats,
    byStatus,
    byGoods,
    weightAgg,
    staffActivity,
    deliveredWithTimes,
  ] = await Promise.all([
    executiveStats(),
    prisma.shipment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.shipment.groupBy({
      by: ["goodsType"],
      _count: { _all: true },
      _sum: { weightKg: true },
    }),
    prisma.shipment.aggregate({ _sum: { weightKg: true } }),
    prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        role: true,
        _count: {
          select: {
            createdShipments: true,
            verifications: true,
            receivedPayments: true,
            releasedDeliveries: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    // Door-to-door time, measured only on cargo that completed the journey.
    prisma.shipment.findMany({
      where: { status: "DELIVERED", deliveredAt: { not: null } },
      select: { registeredAt: true, deliveredAt: true, departedAt: true, arrivedAt: true },
      take: 500,
      orderBy: { deliveredAt: "desc" },
    }),
  ]);

  const avgDays = (pairs: (readonly [Date | null, Date | null])[]) => {
    const values = pairs
      .filter(([a, b]) => a && b)
      .map(([a, b]) => (b!.getTime() - a!.getTime()) / 86_400_000)
      .filter((n) => n >= 0);
    if (values.length === 0) return null;
    return values.reduce((sum, n) => sum + n, 0) / values.length;
  };

  const doorToDoor = avgDays(
    deliveredWithTimes.map((s) => [s.registeredAt, s.deliveredAt] as const)
  );
  const chinaDwell = avgDays(
    deliveredWithTimes.map((s) => [s.registeredAt, s.departedAt] as const)
  );
  const flightToCollection = avgDays(
    deliveredWithTimes.map((s) => [s.arrivedAt, s.deliveredAt] as const)
  );

  const fmtDays = (n: number | null) =>
    n === null ? "—" : `${n.toFixed(1)} days`;

  return (
    <>
      <PageHeader
        title="Reports"
        description="The whole business, measured from the operational record — no separate bookkeeping."
      />

      {/* This page sits inside the General ledger workspace. It lives under
          /app/admin for historical reasons; the tab row is what says where it
          actually belongs. */}
      <FinanceNav tabs={financeTabs(user.role)} />

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Money</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Revenue this month"
            value={formatUsd(stats.revenueThisMonth)}
            icon={Banknote}
            tone="success"
          />
          <StatCard
            label="Collected all time"
            value={formatUsd(stats.allTimeCollected)}
            icon={TrendingUp}
            tone="brand"
          />
          <StatCard
            label="Outstanding"
            value={formatUsd(stats.outstanding)}
            icon={Timer}
            tone={stats.outstanding > 0 ? "warning" : "success"}
          />
          <StatCard
            label="Delivered this month"
            value={stats.deliveredThisMonth}
            icon={Truck}
            tone="info"
          />
        </div>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-sm font-semibold">Speed</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="China desk to collection"
            value={fmtDays(doorToDoor)}
            hint="Average, delivered cargo"
            icon={Timer}
            tone="brand"
          />
          <StatCard
            label="Waiting in China"
            value={fmtDays(chinaDwell)}
            hint="Registered until departure"
            icon={Package}
          />
          <StatCard
            label="Arrival to collection"
            value={fmtDays(flightToCollection)}
            hint="Includes waiting on payment"
            icon={Truck}
          />
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card shadow-soft">
          <h2 className="border-b px-5 py-4 font-display font-semibold">
            Where the cargo is
          </h2>
          <ul className="divide-y">
            {byStatus.map((row) => (
              <li
                key={row.status}
                className="flex items-center justify-between px-5 py-3"
              >
                <span className="text-sm">
                  {SHIPMENT_STATUS_META[row.status].label}
                </span>
                <span className="font-mono text-sm font-medium tabular">
                  {row._count._all}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            {formatWeight(toNumber(weightAgg._sum.weightKg))} handled in total.
          </p>
        </div>

        <div className="rounded-xl border bg-card shadow-soft">
          <h2 className="border-b px-5 py-4 font-display font-semibold">
            What we carry
          </h2>
          {byGoods.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No cargo recorded yet" />
            </div>
          ) : (
            <ul className="divide-y">
              {byGoods
                .sort((a, b) => b._count._all - a._count._all)
                .map((row) => (
                  <li
                    key={row.goodsType}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <span className="text-sm">
                      {GOODS_TYPE_LABELS[row.goodsType]}
                    </span>
                    <span className="text-sm text-muted-foreground tabular">
                      {row._count._all} ·{" "}
                      {formatWeight(toNumber(row._sum.weightKg))}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="rounded-xl border bg-card shadow-soft">
          <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
            <Users className="h-4 w-4" />
            Staff activity
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Registered</TableHead>
                <TableHead className="text-right">Checked in</TableHead>
                <TableHead className="text-right">Payments</TableHead>
                <TableHead className="text-right">Released</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffActivity.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="text-sm font-medium">
                    {user.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {ROLE_LABELS[user.role]}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {user._count.createdShipments}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {user._count.verifications}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {user._count.receivedPayments}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {user._count.releasedDeliveries}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </>
  );
}
