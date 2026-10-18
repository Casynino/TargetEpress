import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  Headset,
  Info,
  KeyRound,
  Monitor as Desktop,
  ShieldCheck,
  Smartphone,
  UserCog,
  UserX,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { Monitor, Level } from "@/lib/developer/monitor";
import type { Pulse } from "@/lib/developer/pulse";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  HealthCard,
  InfoCallout,
  SectionTitle,
  type Tone,
} from "@/components/developer/info";
import {
  HBars,
  Legend,
  ScoreRing,
  SpeedBars,
  StackedBars,
  type Series,
} from "@/components/developer/charts";
import { ROLE_LABELS } from "@/lib/constants";
import {
  bytes,
  eat,
  formatNumber,
  humanize,
  initials,
  shortDay,
  timeAgo,
} from "@/lib/developer/format";
import { cn } from "@/lib/utils";

/* ───────────────────────── shared bits ───────────────────────── */

const ROLE_SERIES: Series[] = [
  { key: "ADMIN", label: "Owner", color: "hsl(var(--chart-1))" },
  { key: "MANAGER", label: "Manager", color: "hsl(var(--chart-6))" },
  { key: "FINANCE", label: "Finance", color: "hsl(var(--chart-2))" },
  {
    key: "CUSTOMER_CARE",
    label: "Customer care",
    color: "hsl(var(--chart-4))",
  },
  {
    key: "CHINA_WAREHOUSE",
    label: "China warehouse",
    color: "hsl(var(--chart-5))",
  },
  {
    key: "DAR_WAREHOUSE",
    label: "Dar warehouse",
    color: "hsl(var(--chart-3))",
  },
  {
    key: "DEVELOPER",
    label: "Developer",
    color: "hsl(var(--muted-foreground))",
  },
];
const ACTIVITY_SERIES: Series[] = [
  { key: "staff", label: "Team", color: "hsl(var(--chart-1))" },
  { key: "dev", label: "Developer", color: "hsl(var(--warning))" },
];
const SECURITY_SERIES: Series[] = [
  { key: "failed", label: "Failed sign-ins", color: "hsl(var(--warning))" },
  {
    key: "refused",
    label: "Developer actions refused",
    color: "hsl(var(--destructive))",
  },
];

const LEVEL: Record<
  Level,
  { icon: LucideIcon; box: string; chip: string; label: string }
> = {
  critical: {
    icon: XCircle,
    box: "border-destructive/30 bg-destructive/10",
    chip: "bg-destructive/15 text-destructive",
    label: "Fix now",
  },
  warning: {
    icon: AlertTriangle,
    box: "border-warning/30 bg-warning/10",
    chip: "bg-warning/20 text-warning",
    label: "Look at it",
  },
  info: {
    icon: Info,
    box: "border-info/25 bg-info/10",
    chip: "bg-info/15 text-info",
    label: "Good to know",
  },
};

export const ROLE_INFO: Record<
  string,
  { label: string; text: string; icon: LucideIcon }
> = {
  ADMIN: {
    label: "Owner (Admin)",
    text: "The business owner. Full view of money, staff and reports.",
    icon: ShieldCheck,
  },
  MANAGER: {
    label: "Manager",
    text: "Runs the business with the owner: approvals, reconciliation and the monthly report.",
    icon: UserCog,
  },
  FINANCE: {
    label: "Finance",
    text: "Prices and bills cargo, collects payments, records expenses and runs the ledgers.",
    icon: Wallet,
  },
  CUSTOMER_CARE: {
    label: "Customer care",
    text: "Talks to customers, books pickups and asks for credit. Cannot approve money.",
    icon: Headset,
  },
  CHINA_WAREHOUSE: {
    label: "China warehouse",
    text: "Receives, labels and dispatches cargo in Guangzhou and Hong Kong. No money powers.",
    icon: Boxes,
  },
  DAR_WAREHOUSE: {
    label: "Dar warehouse",
    text: "Checks cargo in at Dar es Salaam and releases it. Cannot waive storage.",
    icon: Banknote,
  },
  DEVELOPER: {
    label: "Developer (you)",
    text: "Technical account. Can look, cannot move money.",
    icon: UserCog,
  },
};
const ROLE_ORDER = [
  "ADMIN",
  "MANAGER",
  "FINANCE",
  "CUSTOMER_CARE",
  "CHINA_WAREHOUSE",
  "DAR_WAREHOUSE",
  "DEVELOPER",
];

const TONE_DOT: Record<Tone, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

export function Initials({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary",
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/* ───────────────────── status strip (top of Home) ───────────────────── */

/** One compact panel: the verdict, the score wheel, and the four live numbers. */
export function StatusStrip({ m }: { m: Monitor }) {
  const crit = m.problems.filter((p) => p.level === "critical").length;
  const warn = m.problems.filter((p) => p.level === "warning").length;
  const info = m.problems.length - crit - warn;
  const headline = crit
    ? "Needs attention now"
    : warn
      ? "Working, with a few things to look at"
      : "Everything is healthy";
  const summary = crit
    ? `${crit} thing${crit > 1 ? "s are" : " is"} broken and should be fixed now.`
    : warn
      ? `${warn} thing${warn > 1 ? "s" : ""} worth a look. Nothing is broken.`
      : "The database is fast, every required setting is in place and nobody is guessing passwords.";
  const metrics = [
    {
      label: "Database",
      value: m.dbOk ? "Online" : "Down",
      hint: m.dbOk
        ? `${m.dbMs} ms${m.pooled ? " · pooled" : ""}`
        : "cannot connect",
      tone: m.dbOk ? "text-success" : "text-destructive",
    },
    {
      label: "Signed in today",
      value: formatNumber(m.signedIn24),
      hint: "different people",
      tone: "",
    },
    {
      label: "Actions today",
      value: formatNumber(m.activity24h),
      hint: "saved in 24 hours",
      tone: "",
    },
    {
      label: "Failed sign-ins",
      value: formatNumber(m.security.failed24),
      hint: "in 24 hours",
      tone: m.security.failed24 >= 10 ? "text-warning" : "",
    },
  ];
  return (
    <Card>
      <CardContent className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:gap-8">
        <div className="flex items-center gap-5">
          <ScoreRing score={m.score} size={112} />
          <div className="lg:hidden">
            <p className="font-display text-lg font-semibold leading-tight">
              {headline}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
          </div>
        </div>
        <div className="hidden lg:block">
          <p className="font-display text-xl font-semibold leading-tight">
            {headline}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {summary}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant={crit ? "destructive" : "muted"}>
              {crit} to fix now
            </Badge>
            <Badge variant={warn ? "warning" : "muted"}>
              {warn} to look at
            </Badge>
            <Badge variant="muted">{info} for information</Badge>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-2 lg:border-l lg:border-border lg:pl-8">
          {metrics.map((x) => (
            <div key={x.label} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {x.label}
              </dt>
              <dd
                className={cn(
                  "mt-1 font-display text-2xl font-bold leading-none tabular-nums",
                  x.tone,
                )}
              >
                {x.value}
              </dd>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {x.hint}
              </p>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** A problem as a compact card; tap to see what it means and what to do. */
function ProblemCard({ p }: { p: Monitor["problems"][number] }) {
  const l = LEVEL[p.level];
  const Icon = l.icon;
  return (
    <details className={cn("group rounded-xl border open:shadow-soft", l.box)}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            l.chip,
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {p.title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {p.detail}
          </span>
        </span>
        <span
          className={cn(
            "hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline",
            l.chip,
          )}
        >
          {l.label}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-1.5 border-t border-border/60 px-3.5 py-3 text-sm leading-relaxed">
        <p className="text-muted-foreground">{p.detail}</p>
        <p className="text-foreground/90">
          <span className="font-semibold">What to do: </span>
          {p.hint}
        </p>
        {p.href ? (
          <Link
            href={p.href}
            className="inline-block text-xs font-medium text-primary hover:underline"
          >
            Look at it →
          </Link>
        ) : null}
      </div>
    </details>
  );
}

/** Problems, most urgent first. Things to act on are up front; "good to know" is quieter. */
export function Attention({ m }: { m: Monitor }) {
  const act = m.problems.filter((p) => p.level !== "info");
  const know = m.problems.filter((p) => p.level === "info");
  return (
    <section className="space-y-4">
      {act.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-success/25 bg-success/10 px-4 py-2.5 text-sm">
          <CheckCircle2 className="size-4 shrink-0 text-success" />
          <span className="font-medium">Nothing needs your attention</span>
          <span className="hidden text-muted-foreground sm:inline">
            — nothing is broken or waiting too long.
          </span>
        </div>
      ) : (
        <div>
          <SectionTitle
            title={`Needs your attention · ${act.length}`}
            text="Checked just now. Tap a card to see what it means and what to do."
            className="mb-3"
          />
          <div className="grid items-start gap-3 md:grid-cols-2">
            {act.map((p) => (
              <ProblemCard key={p.title} p={p} />
            ))}
          </div>
        </div>
      )}
      {know.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Good to know · {know.length}
          </p>
          <div className="grid items-start gap-3 md:grid-cols-2">
            {know.map((p) => (
              <ProblemCard key={p.title} p={p} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── tab: Activity ───────────────────────── */

export function ActivityPanel({
  m,
  online,
}: {
  m: Monitor;
  online: Pulse["onlineNow"];
}) {
  const peakHour = m.hourSeries.reduce(
    (a, b) => (b.n > a.n ? b : a),
    m.hourSeries[0],
  );
  const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const totalActions14 = m.activitySeries.reduce((s, d) => s + d.staff, 0);
  const totalLogins14 = m.loginSeries.reduce(
    (s, d) =>
      s +
      ROLE_SERIES.reduce(
        (x, r) => x + (d[r.key as keyof typeof d] as number),
        0,
      ),
    0,
  );
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          label="Signed in today"
          value={formatNumber(m.signedIn24)}
          detail="different people in 24 hours"
          tone="info"
          statusText="Live"
          icon={Users}
          meaning={`${formatNumber(m.signedIn7)} different people signed in over the last 7 days. If this drops to zero on a working day, check that sign-in still works.`}
        />
        <HealthCard
          label="Actions in 14 days"
          value={formatNumber(totalActions14)}
          detail="by the team"
          tone="info"
          statusText="Activity"
          icon={Clock}
          meaning={`Every booking, payment, check-in or release counts as one action. Busiest hour: ${peakHour.n > 0 ? `${hourLabel(peakHour.hour)} (Tanzania time)` : "not enough data yet"}.`}
        />
        <HealthCard
          label="Sign-ins in 14 days"
          value={formatNumber(totalLogins14)}
          detail="successful sign-ins"
          tone="info"
          statusText="Sign-ins"
          icon={Users}
          meaning="Each time someone signs in with the right password. The chart below shows which roles they were."
        />
        <HealthCard
          label="Failed sign-ins (24h)"
          value={formatNumber(m.security.failed24)}
          detail="wrong password or blocked account"
          tone={m.security.failed24 >= 10 ? "warn" : "good"}
          statusText={m.security.failed24 >= 10 ? "Look at it" : "Normal"}
          icon={UserX}
          meaning="A few typing mistakes are normal. Many in a day can mean someone is guessing passwords. Details are in the “Sign-ins & security” tab."
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Sign-ins per day</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Last 14 days, coloured by who signed in. Hover a bar for exact
              numbers.
            </p>
            <StackedBars
              data={m.loginSeries.map((d) => ({
                label: d.day,
                values: d as unknown as Record<string, number>,
              }))}
              series={ROLE_SERIES}
              labelEvery={2}
              formatLabel={shortDay}
            />
            <Legend series={ROLE_SERIES} className="mt-4" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Actions per day</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Everything saved in the audit trail, split between the team and
              you.
            </p>
            <StackedBars
              data={m.activitySeries.map((d) => ({
                label: d.day,
                values: { staff: d.staff, dev: d.dev },
              }))}
              series={ACTIVITY_SERIES}
              labelEvery={2}
              formatLabel={shortDay}
            />
            <Legend series={ACTIVITY_SERIES} className="mt-4" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Busiest hours of the day</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              When the team works (Tanzania time, last 14 days).
              {peakHour.n > 0 && (
                <>
                  {" "}
                  Peak is around{" "}
                  <strong className="text-foreground">
                    {hourLabel(peakHour.hour)}
                  </strong>
                  .
                </>
              )}
            </p>
            <StackedBars
              data={m.hourSeries.map((h) => ({
                label: String(h.hour),
                values: { n: h.n },
              }))}
              series={[
                { key: "n", label: "Actions", color: "hsl(var(--chart-1))" },
              ]}
              height={170}
              labelEvery={3}
              formatLabel={(h) => `${h}h`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Where the work happens</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Actions by area, last 7 days.
            </p>
            <HBars
              items={m.modules.map((x) => ({
                label: humanize(x.name),
                value: x.n,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Recent sign-ins</h2>
              <p className="text-xs text-muted-foreground">
                The last 12 successful sign-ins: who, on what device, from
                where.
              </p>
            </div>
            {m.recentLogins.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No sign-ins recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead className="text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.recentLogins.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Initials name={l.user?.name ?? "?"} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {l.user?.name ?? "Unknown"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {l.user ? ROLE_LABELS[l.user.role] : ""}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <span className="inline-flex items-center gap-1.5">
                            {l.agent.mobile ? (
                              <Smartphone className="size-3.5 text-muted-foreground" />
                            ) : (
                              <Desktop className="size-3.5 text-muted-foreground" />
                            )}
                            {l.agent.browser} · {l.agent.os}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {l.ipAddress ?? "—"}
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap text-right text-sm text-muted-foreground"
                          title={eat(l.createdAt)}
                        >
                          {timeAgo(l.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Online right now</h2>
                <Badge variant={online.length ? "success" : "muted"}>
                  {online.length}
                </Badge>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Active in the last 10 minutes.
              </p>
              {online.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody at the moment.
                </p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {online.map((u) => (
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
              <h2 className="text-sm font-semibold">Most active people</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Actions saved in the last 7 days.
              </p>
              <HBars
                items={m.topActors.map((x) => ({ label: x.name, value: x.n }))}
                color="hsl(var(--chart-2))"
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold">Not using the system</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Active accounts that never signed in, or not for 30+ days.
              </p>
              {m.neverSignedIn.length + m.inactive.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Everyone has signed in recently.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {m.neverSignedIn.map((u) => (
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
                      <Badge variant="warning">Never</Badge>
                    </li>
                  ))}
                  {m.inactive.map((u) => (
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
                        {u.lastLoginAt ? timeAgo(u.lastLoginAt) : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────── tab: Speed & size ───────────────────────── */

export function SpeedPanel({ m }: { m: Monitor }) {
  const notSet = m.env.filter((e) => !e.set).length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Real queries timed right now against the live database, and how big the
        database has grown.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Database speed</h2>
              <Badge
                variant={
                  m.avgMs < 150
                    ? "success"
                    : m.avgMs < 400
                      ? "warning"
                      : "destructive"
                }
              >
                average {m.avgMs} ms
              </Badge>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Each bar is one typical thing the app does. Shorter is faster.
            </p>
            <SpeedBars probes={m.probes} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Database size</h2>
              <Badge variant="muted">{bytes(m.dbSize)} total</Badge>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              The biggest tables, and roughly how many rows each holds.
            </p>
            <HBars
              items={m.tables.slice(0, 6).map((t) => ({
                label: t.name,
                value: t.bytes,
                sub:
                  t.rows > 0 ? `about ${formatNumber(t.rows)} rows` : undefined,
              }))}
              color="hsl(var(--chart-2))"
              format={bytes}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Data checks</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Rules that must always be true. If one fails, numbers on screen
              may be wrong.
            </p>
            <ul className="space-y-3">
              {m.checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2.5 text-sm">
                  {c.bad === null ? (
                    <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  ) : c.bad === 0 ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0">
                    {c.label}
                    <span
                      className={cn(
                        "ml-1.5 text-xs",
                        c.bad === null
                          ? "text-muted-foreground"
                          : c.bad === 0
                            ? "text-success"
                            : "font-semibold text-destructive",
                      )}
                    >
                      {c.bad === null
                        ? "could not check"
                        : c.bad === 0
                          ? "OK"
                          : `${c.bad} found`}
                    </span>
                  </span>
                </li>
              ))}
              <li className="flex items-start gap-2.5 text-sm">
                <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {m.suspended} suspended account{m.suspended === 1 ? "" : "s"}{" "}
                  · {notSet} setting{notSet === 1 ? "" : "s"} not set
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ───────────────────── tab: Sign-ins & security ───────────────────── */

export function SecurityPanel({ m }: { m: Monitor }) {
  const s = m.security;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Sign-ins that were refused, and anything your own account was stopped
        from doing. This is how you hear about someone guessing passwords before
        anybody complains.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">
              Failed sign-ins and refused Developer actions per day
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {s.failed24 === 0
                ? "No failed sign-ins in the last 24 hours."
                : `${s.failed24} failed sign-in${s.failed24 === 1 ? "" : "s"} in the last 24 hours.`}
              {s.devRefused24 > 0 &&
                ` ${s.devRefused24} Developer action${s.devRefused24 === 1 ? " was" : "s were"} refused.`}
            </p>
            <StackedBars
              data={m.securitySeries.map((d) => ({
                label: d.day,
                values: { failed: d.failed, refused: d.refused },
              }))}
              series={SECURITY_SERIES}
              labelEvery={2}
              formatLabel={shortDay}
              height={160}
              emptyText="No failed sign-ins or refused actions in 14 days. Good."
            />
            <Legend series={SECURITY_SERIES} className="mt-4" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Failed sign-ins</h2>
              <p className="text-xs text-muted-foreground">
                Latest refused attempts. Passwords are never stored. Repeats
                within a minute are merged (×N).
              </p>
            </div>
            {s.recentFailed.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                None recorded.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {s.recentFailed.map((f) => (
                  <li key={f.id} className="px-5 py-2.5 text-sm">
                    <p className="break-all leading-snug">
                      {f.email}
                      {f.count > 1 && (
                        <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                          ×{f.count}
                        </span>
                      )}
                    </p>
                    <p
                      className="mt-0.5 text-xs text-muted-foreground"
                      title={eat(f.createdAt)}
                    >
                      {timeAgo(f.createdAt)}
                      {f.ip ? ` · ${f.ip}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <InfoCallout
          icon={KeyRound}
          tone={s.devLocked24 > 0 ? "warn" : "good"}
          title="Your Developer sign-in"
        >
          {s.devFailed24 === 0
            ? "No wrong-password tries on your account in the last 24 hours. After 5 wrong tries from one place it locks for 15 minutes."
            : `${s.devFailed24} wrong-password tr${s.devFailed24 === 1 ? "y" : "ies"} in the last 24 hours${s.devLocked24 > 0 ? ", and it locked itself" : ""}. If these were not you, change your password.`}
        </InfoCallout>
        <InfoCallout icon={Info} title="Page crashes">
          The app does not keep its own crash log. If someone says a page broke,
          open the project in Vercel → Logs and search the page address.
        </InfoCallout>
      </div>
    </div>
  );
}

/* ───────────────────────── tab: Settings ───────────────────────── */

export function SettingsPanel({ m }: { m: Monitor }) {
  const missingRequired = m.env.filter((e) => e.required && !e.set);
  const missingOptional = m.env.filter((e) => !e.required && !e.set);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {missingRequired.length
          ? "Some required settings are missing — fix those first. Only whether a setting exists is shown, never its secret value."
          : "All required settings are in place. Only whether a setting exists is shown, never its secret value."}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {m.env.map((e) => {
          const tone: Tone = e.set ? "good" : e.required ? "bad" : "warn";
          return (
            <Card key={e.name}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                        tone === "good" && "bg-success/15 text-success",
                        tone === "bad" && "bg-destructive/15 text-destructive",
                        tone === "warn" && "bg-warning/15 text-warning",
                      )}
                    >
                      <KeyRound className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{e.title}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {e.name}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      e.set ? "success" : e.required ? "destructive" : "warning"
                    }
                  >
                    {e.set ? "Set" : e.required ? "Missing" : "Not set"}
                  </Badge>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {e.purpose}
                </p>
                {!e.set && (
                  <p
                    className={cn(
                      "mt-2.5 rounded-lg px-3 py-2 text-xs leading-relaxed",
                      e.required
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-warning",
                    )}
                  >
                    <span className="font-semibold">
                      Because it is missing:{" "}
                    </span>
                    {e.ifMissing}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {missingOptional.length > 0 && missingRequired.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {missingOptional.length} optional setting
          {missingOptional.length > 1 ? "s are" : " is"} not set. The site works
          without {missingOptional.length > 1 ? "them" : "it"}; the note on each
          card explains what you lose.
        </p>
      )}
    </div>
  );
}

/* ───────────────────── tab: People & my actions ───────────────────── */

export function PeoplePanel({ m }: { m: Monitor }) {
  const byRole = new Map<
    string,
    { active: number; suspended: number; total: number }
  >();
  for (const r of m.usersByRole) {
    const cur = byRole.get(r.role) ?? { active: 0, suspended: 0, total: 0 };
    const n = r._count._all;
    cur.total += n;
    if (r.active) cur.active += n;
    else cur.suspended += n;
    byRole.set(r.role, cur);
  }
  const totalUsers = [...byRole.values()].reduce((s, r) => s + r.total, 0);
  const roles = ROLE_ORDER.filter((r) => byRole.has(r));
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle
          title={`${formatNumber(totalUsers)} accounts`}
          text="Who has an account, grouped by what they do. Open Access to work as any of them."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => {
            const info = ROLE_INFO[role];
            const c = byRole.get(role)!;
            const Icon = info.icon;
            return (
              <Card key={role}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">{info.label}</p>
                    </div>
                    <span className="font-display text-2xl font-semibold tabular-nums">
                      {c.total}
                    </span>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                    {info.text}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="success">{c.active} active</Badge>
                    {c.suspended > 0 && (
                      <Badge variant="destructive">
                        {c.suspended} suspended
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold">Your recent actions</h2>
                <p className="text-xs text-muted-foreground">
                  The last things recorded under your name.
                </p>
              </div>
              <Link
                href="/app/developer/audit?scope=developer"
                className="text-xs font-medium text-primary hover:underline"
              >
                See all
              </Link>
            </div>
            {m.recentDev.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Nothing yet. Your actions will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {m.recentDev.map((log) => {
                  const meta = (log.metadata ?? {}) as { outcome?: string };
                  const tone: Tone =
                    meta.outcome === "failure" ? "bad" : "info";
                  return (
                    <li
                      key={log.id}
                      className="flex items-start gap-3 px-5 py-3"
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          TONE_DOT[tone],
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">{log.summary}</p>
                        <p
                          className="mt-0.5 text-xs text-muted-foreground"
                          title={eat(log.createdAt)}
                        >
                          {timeAgo(log.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3 lg:col-span-2">
          <InfoCallout
            icon={ShieldCheck}
            tone="good"
            title="Everything you do is on record"
          >
            Your name is attached to every action, including when you work as
            someone else. The records cannot be edited or deleted — not even by
            you.
          </InfoCallout>
          <InfoCallout
            icon={KeyRound}
            tone="warn"
            title="What you cannot do while working as someone"
          >
            Open accounts, change roles, reset or change passwords, suspend
            people. Everything else you may do as them, and it is all recorded
            as you. This stops Work as from being used to take over an account.
          </InfoCallout>
          <InfoCallout title="Good to know">
            Your session ends after 8 hours. Working as someone ends by itself
            after 4 hours. Build{" "}
            <span className="font-mono">{m.build.slice(0, 8)}</span> · Node{" "}
            {m.node} · {m.nodeEnv}.
          </InfoCallout>
        </div>
      </section>
    </div>
  );
}
