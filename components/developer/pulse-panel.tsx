import {
  AlertTriangle,
  Banknote,
  BellRing,
  Boxes,
  Clock,
  HandCoins,
  LifeBuoy,
  MessageSquare,
  Plane,
  ReceiptText,
  Truck,
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
import {
  eat,
  formatNumber,
  humanize,
  shortDay,
  timeAgo,
} from "@/lib/developer/format";
import type { Ops, Pulse } from "@/lib/developer/pulse";
import { formatMoney } from "@/lib/format";

const CARGO: Series[] = [
  { key: "n", label: "Cargo added", color: "hsl(var(--chart-1))" },
];
const PAYMENTS: Series[] = [
  { key: "n", label: "Payments recorded", color: "hsl(var(--chart-5))" },
];
const LEDGER: Series[] = [
  { key: "n", label: "Ledger lines", color: "hsl(var(--chart-2))" },
];
const MESSAGES: Series[] = [
  { key: "n", label: "Messages sent", color: "hsl(var(--chart-6))" },
];

const ageDays = (d: Date) =>
  Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));
const dayOf = (d: Date | null) =>
  d
    ? eat(d)
        .replace(" EAT", "")
        .replace(/, \d\d:\d\d$/, "")
    : "—";
const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`;

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** A table card with a title, a one-line explanation and a quiet empty state. */
function ListCard({
  title,
  text,
  empty,
  isEmpty,
  children,
}: {
  title: string;
  text: React.ReactNode;
  empty: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{text}</p>
        </div>
        {isEmpty ? (
          <Empty>{empty}</Empty>
        ) : (
          <div className="overflow-x-auto">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────────────────── tab: Cargo ───────────────────────── */

export function CargoPanel({ p, o }: { p: Pulse; o: Ops }) {
  const inTransit =
    p.batchesByStatus.find((b) => b.name === "IN_TRANSIT")?.n ?? 0;
  return (
    <div className="space-y-6">
      <Lead>
        The cargo itself: what is in the system, where it is, what is wrong with
        it and who sends the most. Read only. Deleted cargo is never counted.
      </Lead>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          label="Cargo in the system"
          value={formatNumber(p.activeCargo)}
          detail={`${formatNumber(p.totalCargo)} ever`}
          tone="info"
          statusText="Active"
          icon={Boxes}
          meaning="Registered, flying or waiting in Dar. Delivered and cancelled cargo is not counted."
        />
        <HealthCard
          label="Cargo added (7 days)"
          value={formatNumber(p.cargoAdded7)}
          detail={`${plural(p.newCustomers, "new customer")} in 30 days`}
          tone="info"
          statusText="Intake"
          icon={Plane}
          meaning={`${formatNumber(p.customers)} customers on the books. A quiet week is worth asking the China warehouse about.`}
        />
        <HealthCard
          label="Flights on the way"
          value={formatNumber(inTransit)}
          detail="left China, not yet landed"
          tone="info"
          statusText="In the air"
          icon={Truck}
          meaning="Flights marked as departed that have not been marked as landed in Dar yet."
        />
        <HealthCard
          label="Open cargo issues"
          value={formatNumber(o.openIssues)}
          detail="damaged, missing or short-landed"
          tone="info"
          statusText="For awareness"
          icon={AlertTriangle}
          meaning="Problems raised on cargo that nobody has closed yet. The oldest ones are listed below."
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Cargo added per day</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Last 14 days, Tanzania time.
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
            <h2 className="text-sm font-semibold">Cargo by stage</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Where every piece is right now.
            </p>
            <HBars
              items={p.cargoByStatus.map((x) => ({
                label: humanize(x.name),
                value: x.n,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ListCard
          title="Latest flights"
          text={
            p.batchesByStatus
              .map((b) => `${b.n} ${humanize(b.name).toLowerCase()}`)
              .join(" · ") || "No flights yet."
          }
          empty="No flights recorded yet."
          isEmpty={p.batches.length === 0}
        >
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
        </ListCard>

        <ListCard
          title="Oldest open cargo issues"
          text="Raised on a piece of cargo and not closed yet, oldest first."
          empty="No open cargo issues."
          isEmpty={o.oldestIssues.length === 0}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cargo</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Waiting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.oldestIssues.map((i) => (
                <TableRow
                  key={`${i.tracking}-${i.type}-${i.raisedAt.toString()}`}
                >
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {i.tracking}
                  </TableCell>
                  <TableCell className="text-sm">{humanize(i.type)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{humanize(i.status)}</Badge>
                  </TableCell>
                  <TableCell
                    className="whitespace-nowrap text-right text-sm text-muted-foreground"
                    title={eat(i.raisedAt)}
                  >
                    {ageDays(i.raisedAt)} days
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
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
            <h2 className="text-sm font-semibold">Cargo issues by status</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Every issue ever raised, by where it stands.
            </p>
            <HBars
              items={o.issuesByStatus.map((x) => ({
                label: humanize(x.name),
                value: x.n,
              }))}
              color="hsl(var(--warning))"
              emptyText="No cargo issues have been raised."
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ───────────────────────── tab: Money ───────────────────────── */

export function MoneyPanel({ p, o }: { p: Pulse; o: Ops }) {
  const owedLine = p.owed.length
    ? p.owed.map((x) => formatMoney(x.owed, x.currency)).join(" + ")
    : "Nothing outstanding";
  return (
    <div className="space-y-6">
      <Lead>
        Bills, payments and the money book. Worked out from the records as they
        stand — nothing here is stored or typed in. Each currency is added up on
        its own and never mixed; payments are counted rather than added up,
        because a payment and its bill can be in different currencies.
      </Lead>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          label="Bills waiting for money"
          value={formatNumber(p.unpaidBills)}
          detail={owedLine}
          tone="info"
          statusText="For awareness"
          icon={ReceiptText}
          meaning="Unpaid and part-paid bills, worked out as total minus paid."
        />
        <HealthCard
          label="Payments (7 days)"
          value={formatNumber(p.payments7)}
          detail="recorded by Finance"
          tone="info"
          statusText="Money in"
          icon={Banknote}
          meaning="How many payments were recorded in the last 7 days."
        />
        <HealthCard
          label="Waiting for Finance to check"
          value={formatNumber(o.pendingSubmissions)}
          detail={
            o.oldestSubmission
              ? `oldest ${ageDays(o.oldestSubmission)} days`
              : "nothing waiting"
          }
          tone="info"
          statusText="For awareness"
          icon={HandCoins}
          meaning="Payments handed up by Support that Finance has not verified yet. They are not money in the books until checked."
        />
        <HealthCard
          label="Expenses waiting approval"
          value={formatNumber(o.pendingExpenses)}
          detail="not yet approved or paid"
          tone="info"
          statusText="For awareness"
          icon={Clock}
          meaning="Costs that have been entered and are still waiting for a decision."
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
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
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Money-book lines per day</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Every line in the ledger, last 14 days. Lines are never edited — a
              mistake is answered by a new line.
            </p>
            <StackedBars
              data={o.ledgerSeries.map((d) => ({
                label: d.day,
                values: { n: d.n },
              }))}
              series={LEDGER}
              labelEvery={2}
              formatLabel={shortDay}
              emptyText="No ledger lines in 14 days."
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
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
        <Card>
          <CardContent className="p-5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">The money book</h2>
              <Clock className="size-4 text-muted-foreground" />
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Ledger activity and storage charging.
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Last ledger line</dt>
                <dd
                  className="text-right"
                  title={o.lastLedger ? eat(o.lastLedger) : undefined}
                >
                  {o.lastLedger ? timeAgo(o.lastLedger) : "None yet"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Lines in 30 days</dt>
                <dd className="tabular-nums">
                  {formatNumber(o.ledgerLines30)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  Corrections in 30 days
                </dt>
                <dd className="tabular-nums">
                  {formatNumber(o.corrections30)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Last storage charge</dt>
                <dd
                  className="text-right"
                  title={p.lastCharge ? eat(p.lastCharge) : undefined}
                >
                  {p.lastCharge ? timeAgo(p.lastCharge) : "None yet"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  Storage charges in 7 days
                </dt>
                <dd className="tabular-nums">{formatNumber(p.charged7)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              A correction is a line that reverses an earlier one. A few is
              normal. Storage charges itself every night and at every warehouse
              scan; if cargo has sat past its free days for a week and the last
              charge is old, the nightly job is not running.
            </p>
          </CardContent>
        </Card>
      </section>

      <ListCard
        title="Oldest bills still waiting"
        text="Unpaid or part-paid, oldest first. The amount is what is still owed."
        empty="No bills are waiting for money."
        isEmpty={p.oldestUnpaid.length === 0}
      >
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
                <TableCell className="max-w-[16rem] truncate text-sm">
                  {b.customer}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                  {formatMoney(b.owed, b.currency)}
                </TableCell>
                <TableCell
                  className="whitespace-nowrap text-right text-sm text-muted-foreground"
                  title={eat(b.issued)}
                >
                  {ageDays(b.issued)} days
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListCard>
    </div>
  );
}

/* ───────────────────── tab: Messages & requests ───────────────────── */

export function MessagesPanel({ o }: { o: Ops }) {
  const requests = o.pendingBookings + o.pendingPickups;
  const messages14 = o.messageSeries.reduce((s, d) => s + d.n, 0);
  return (
    <div className="space-y-6">
      <Lead>
        The people-facing side: what customers are asking for, what the team has
        said back, and how long things have been waiting. These are queues —
        what matters is how old the oldest one is.
      </Lead>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          label="Open tickets"
          value={formatNumber(o.openTickets)}
          detail="Customer Care"
          tone="info"
          statusText="For awareness"
          icon={LifeBuoy}
          meaning="Tickets that are open, in progress or waiting for the customer."
        />
        <HealthCard
          label="Requests waiting"
          value={formatNumber(requests)}
          detail={`${plural(o.pendingBookings, "booking")} · ${plural(o.pendingPickups, "pickup")}`}
          tone="info"
          statusText="For awareness"
          icon={Truck}
          meaning="Booking and pickup requests from the public website that nobody has contacted yet."
        />
        <HealthCard
          label="Messages sent (14 days)"
          value={formatNumber(messages14)}
          detail="to customers"
          tone="info"
          statusText="Outbound"
          icon={MessageSquare}
          meaning="Notices the system and the team sent to customers: arrivals, bills, reminders, pickups."
        />
        <HealthCard
          label="Alerts not yet read"
          value={formatNumber(o.unreadAlerts)}
          detail="across all staff"
          tone="info"
          statusText="Inbox"
          icon={BellRing}
          meaning="Notifications sitting unread in staff bells. A very large number means people are not looking at them."
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">
              Messages to customers per day
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Last 14 days, Tanzania time.
            </p>
            <StackedBars
              data={o.messageSeries.map((d) => ({
                label: d.day,
                values: { n: d.n },
              }))}
              series={MESSAGES}
              labelEvery={2}
              formatLabel={shortDay}
              emptyText="No messages sent in 14 days."
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">What the messages were</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              By kind, last 30 days.
            </p>
            <HBars
              items={o.messagesByKind.map((x) => ({
                label: humanize(x.name),
                value: x.n,
              }))}
              color="hsl(var(--chart-6))"
              emptyText="No messages in 30 days."
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ListCard
          title="Oldest open tickets"
          text="Waiting on Customer Care, oldest first."
          empty="No open tickets."
          isEmpty={o.oldestTickets.length === 0}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>About</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Waiting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.oldestTickets.map((t) => (
                <TableRow key={t.number}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {t.number}
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate text-sm">
                    {t.subject}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{humanize(t.priority)}</Badge>
                  </TableCell>
                  <TableCell
                    className="whitespace-nowrap text-right text-sm text-muted-foreground"
                    title={eat(t.createdAt)}
                  >
                    {ageDays(t.createdAt)} days
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListCard>

        <ListCard
          title="Oldest website requests"
          text="Booking and pickup requests nobody has contacted yet."
          empty="Every request has been answered."
          isEmpty={o.oldestRequests.length === 0}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="text-right">Waiting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.oldestRequests.map((r) => (
                <TableRow key={r.reference}>
                  <TableCell className="whitespace-nowrap text-sm">
                    <Badge variant="outline" className="mr-2">
                      {r.kind}
                    </Badge>
                    <span className="font-mono text-xs">{r.reference}</span>
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate text-sm">
                    {r.who}
                  </TableCell>
                  <TableCell
                    className="whitespace-nowrap text-right text-sm text-muted-foreground"
                    title={eat(r.createdAt)}
                  >
                    {ageDays(r.createdAt)} days
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Tickets by status</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Every ticket ever opened.
            </p>
            <HBars
              items={o.ticketsByStatus.map((x) => ({
                label: humanize(x.name),
                value: x.n,
              }))}
              color="hsl(var(--chart-4))"
              emptyText="No tickets yet."
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">
              Sourcing requests by status
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Customers asking the team to find or buy a product.
            </p>
            <HBars
              items={o.sourcingByStatus.map((x) => ({
                label: humanize(x.name),
                value: x.n,
              }))}
              color="hsl(var(--chart-2))"
              emptyText="No sourcing requests yet."
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
