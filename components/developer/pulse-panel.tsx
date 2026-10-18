import {
  Banknote,
  Boxes,
  Clock,
  Plane,
  ReceiptText,
  Users,
} from "lucide-react";

import { HBars, StackedBars, type Series } from "@/components/developer/charts";
import { HealthCard } from "@/components/developer/info";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS } from "@/lib/constants";
import {
  eat,
  formatNumber,
  humanize,
  shortDay,
  timeAgo,
} from "@/lib/developer/format";
import type { Pulse } from "@/lib/developer/pulse";
import { formatMoney } from "@/lib/format";

const CARGO: Series[] = [
  { key: "n", label: "Cargo added", color: "hsl(var(--chart-1))" },
];
const PAYMENTS: Series[] = [
  { key: "n", label: "Payments recorded", color: "hsl(var(--chart-5))" },
];

const days = (d: Date) =>
  Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));
const dayOf = (d: Date | null) =>
  d
    ? eat(d)
        .replace(" EAT", "")
        .replace(/, \d\d:\d\d$/, "")
    : "—";

/** Cargo, bills, payments, flights and who is online — what is really going on. */
export function PulsePanel({ p }: { p: Pulse }) {
  const owedLine = p.owed.length
    ? p.owed.map((o) => formatMoney(o.owed, o.currency)).join(" + ")
    : "Nothing outstanding";
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        What is moving through the business right now. Read only, and every
        figure is worked out from the records as they stand — nothing here is
        stored or typed in.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          label="Cargo in the system"
          value={formatNumber(p.activeCargo)}
          detail={`${formatNumber(p.totalCargo)} ever, not counting deleted`}
          tone="info"
          statusText="Active"
          icon={Boxes}
          meaning="Registered, flying or waiting in Dar. Delivered and cancelled cargo is not counted."
        />
        <HealthCard
          label="Cargo added (7 days)"
          value={formatNumber(p.cargoAdded7)}
          detail={`${formatNumber(p.newCustomers)} new customer${p.newCustomers === 1 ? "" : "s"} in 30 days`}
          tone="info"
          statusText="Intake"
          icon={Plane}
          meaning={`${formatNumber(p.customers)} customers on the books. A quiet week here is worth asking the China warehouse about.`}
        />
        <HealthCard
          label="Bills waiting for money"
          value={formatNumber(p.unpaidBills)}
          detail={owedLine}
          tone={p.unpaidBills > 0 ? "warn" : "good"}
          statusText={p.unpaidBills > 0 ? "Outstanding" : "Clear"}
          icon={ReceiptText}
          meaning="Unpaid and part-paid bills, worked out as total minus paid. Each currency is added up on its own, never mixed."
        />
        <HealthCard
          label="Payments (7 days)"
          value={formatNumber(p.payments7)}
          detail="recorded by Finance"
          tone="info"
          statusText="Money in"
          icon={Banknote}
          meaning="How many payments were recorded. Counted, not added up, because a payment and its bill can be in different currencies."
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Cargo added per day</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Last 14 days, Tanzania time. Deleted cargo is not counted.
            </p>
            <StackedBars
              data={p.cargoSeries.map((d) => ({
                label: d.day,
                values: { n: d.n },
              }))}
              series={CARGO}
              labelEvery={2}
              formatLabel={shortDay}
              emptyText="No cargo added in 14 days."
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Payments recorded per day</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Last 14 days, by the day the money was received.
            </p>
            <StackedBars
              data={p.paymentSeries.map((d) => ({
                label: d.day,
                values: { n: d.n },
              }))}
              series={PAYMENTS}
              labelEvery={2}
              formatLabel={shortDay}
              emptyText="No payments in 14 days."
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Cargo by stage</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Where every piece of cargo is right now.
            </p>
            <HBars
              items={p.cargoByStatus.map((x) => ({
                label: humanize(x.name),
                value: x.n,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Bills by status</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              How many bills are in each state.
            </p>
            <HBars
              items={p.billsByStatus.map((x) => ({
                label: humanize(x.name),
                value: x.n,
              }))}
              color="hsl(var(--chart-2))"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">How people pay</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Payments by method, last 30 days.
            </p>
            <HBars
              items={p.methods.map((x) => ({
                label: humanize(x.name),
                value: x.n,
              }))}
              color="hsl(var(--chart-5))"
              emptyText="No payments in 30 days."
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Latest flights</h2>
              <p className="text-xs text-muted-foreground">
                {p.batchesByStatus
                  .map((b) => `${b.n} ${humanize(b.name).toLowerCase()}`)
                  .join(" · ") || "No flights yet."}
              </p>
            </div>
            {p.batches.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No flights recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flight</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="text-right">Cargo</TableHead>
                      <TableHead className="text-right">Left</TableHead>
                      <TableHead className="text-right">Landed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.batches.map((b) => (
                      <TableRow key={b.number}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {b.number}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{humanize(b.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {b.cargo}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                          {dayOf(b.departedAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                          {dayOf(b.arrivedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">
                Oldest bills still waiting
              </h2>
              <p className="text-xs text-muted-foreground">
                Unpaid or part-paid, oldest first. The amount is what is still
                owed.
              </p>
            </div>
            {p.oldestUnpaid.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No bills are waiting for money.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Owed</TableHead>
                      <TableHead className="text-right">Age</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.oldestUnpaid.map((b) => (
                      <TableRow key={b.number}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {b.number}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate text-sm">
                          {b.customer}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                          {formatMoney(b.owed, b.currency)}
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap text-right text-sm text-muted-foreground"
                          title={eat(b.issued)}
                        >
                          {days(b.issued)} days
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Busiest customers</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Most cargo registered, last 30 days.
            </p>
            <HBars
              items={p.busiest.map((x) => ({ label: x.name, value: x.n }))}
              color="hsl(var(--chart-6))"
              emptyText="No cargo in 30 days."
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Online right now</h2>
              <Badge variant={p.onlineNow.length ? "success" : "muted"}>
                {p.onlineNow.length}
              </Badge>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Active in the last 10 minutes.
            </p>
            {p.onlineNow.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nobody at the moment.
              </p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {p.onlineNow.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">
                      {u.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        · {ROLE_LABELS[u.role]}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {u.lastActiveAt ? timeAgo(u.lastActiveAt) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Storage charging</h2>
              <Clock className="size-4 text-muted-foreground" />
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Storage is charged by itself every night and at every warehouse
              scan.
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Last charge recorded</dt>
                <dd
                  className="text-right"
                  title={p.lastCharge ? eat(p.lastCharge) : undefined}
                >
                  {p.lastCharge ? timeAgo(p.lastCharge) : "None yet"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Charges in 7 days</dt>
                <dd className="tabular-nums">{formatNumber(p.charged7)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              If cargo has been past its free days for a week and this says
              “None yet”, the nightly job is not running.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
