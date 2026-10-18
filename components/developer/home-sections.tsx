import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  Headset,
  Info,
  KeyRound,
  Lock,
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
import { DEVELOPER_LOCKOUT } from "@/lib/developer-shared";
import type { CheckResult } from "@/lib/developer/diagnose";
import type { Security } from "@/lib/developer/events";
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
    text: "Technical account. Keeps the system working; can work as anyone.",
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

/* ───────────────────── needs your attention (ORA's design) ───────────────────── */

/** A problem as a compact card; tap to see what it means and what to do. */
function ProblemCard({
  p,
  showLevel = false,
}: {
  p: Monitor["problems"][number];
  showLevel?: boolean;
}) {
  const l = LEVEL[p.level];
  const Icon = l.icon;
  return (
    <details
      className={cn(
        "group min-w-0 rounded-xl border open:shadow-soft md:[&:last-child:nth-child(odd)]:col-span-2",
        l.box,
      )}
    >
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
          <span className="line-clamp-2 text-sm font-semibold leading-snug">
            {p.title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {p.detail}
          </span>
        </span>
        {showLevel && (
          <span
            className={cn(
              "hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:inline",
              l.chip,
            )}
          >
            {l.label}
          </span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-1.5 border-t border-border/60 px-3.5 py-3 text-sm leading-relaxed">
        <p className="text-muted-foreground">{p.detail}</p>
        <p className="text-foreground/90">
          <span className="font-semibold">What to do: </span>
          {p.hint}
        </p>
        {p.items?.length ? (
          <ul className="space-y-0.5 rounded-lg bg-background/50 px-3 py-2 font-mono text-xs text-muted-foreground">
            {p.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        ) : null}
        {p.href ? (
          <Link
            href={p.href}
            className="mt-1 inline-flex items-center gap-1 rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-border transition-colors hover:bg-muted"
          >
            Look at it <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </details>
  );
}

const CHECK_ORDER = { fix: 0, look: 1, unknown: 2, ok: 3 } as const;

/** Every check that was made, passing or not, folded away until asked for. */
function CheckList({ checks }: { checks: CheckResult[] }) {
  const okCount = checks.filter((c) => c.status === "ok").length;
  const unknown = checks.filter((c) => c.status === "unknown").length;
  const sorted = [...checks].sort(
    (a, b) => CHECK_ORDER[a.status] - CHECK_ORDER[b.status],
  );
  return (
    <details className="group border-t border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span>
          What was checked · {okCount} of {checks.length} fine
          {unknown > 0 ? `, ${unknown} not checked yet` : ""}
        </span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {sorted.map((c) => (
          <li key={c.label} className="flex items-start gap-3 px-5 py-2.5">
            {c.status === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            ) : c.status === "fix" ? (
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : c.status === "look" ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm">{c.label}</p>
              <p className="text-xs text-muted-foreground">{c.detail}</p>
            </div>
            <Badge
              className="shrink-0 whitespace-nowrap"
              variant={
                c.status === "ok"
                  ? "success"
                  : c.status === "fix"
                    ? "destructive"
                    : c.status === "look"
                      ? "warning"
                      : "secondary"
              }
            >
              {c.status === "ok"
                ? "Fine"
                : c.status === "fix"
                  ? "Fix now"
                  : c.status === "look"
                    ? "Look at it"
                    : "Not checked yet"}
            </Badge>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Problems, most urgent first, in one bounded panel. "Good to know" stays folded at the bottom. */
export function Attention({
  m,
  checks,
}: {
  m: Monitor;
  checks: CheckResult[];
}) {
  const act = m.problems.filter((p) => p.level !== "info");
  const know = m.problems.filter((p) => p.level === "info");
  const crit = act.filter((p) => p.level === "critical").length;
  const warn = act.length - crit;
  // Name the level on a card only when the list mixes levels, or the card is critical.
  const mixed = crit > 0 && warn > 0;
  return (
    <section>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">
              Needs your attention
            </h2>
            <p className="text-xs text-muted-foreground">
              Checked just now. Tap a card to see what it means and what to do.
            </p>
          </div>
          {act.length === 0 ? (
            <Badge variant="success">All clear</Badge>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {crit > 0 && (
                <Badge variant="destructive">{crit} to fix now</Badge>
              )}
              {warn > 0 && <Badge variant="warning">{warn} to look at</Badge>}
            </div>
          )}
        </div>
        <div className="p-4 sm:p-5">
          {act.length === 0 ? (
            <div className="flex items-center gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                <CheckCircle2 className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  Nothing needs your attention
                </p>
                <p className="text-sm text-muted-foreground">
                  Nothing is broken, and every required setting is in place.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
              {act.map((p) => (
                <ProblemCard
                  key={p.title}
                  p={p}
                  showLevel={mixed || p.level === "critical"}
                />
              ))}
            </div>
          )}
        </div>
        <CheckList checks={checks} />
        {know.length > 0 && (
          <details className="group border-t border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
              <span>Good to know · {know.length}</span>
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid grid-cols-1 items-start gap-3 px-4 pb-4 sm:px-5 sm:pb-5 md:grid-cols-2">
              {know.map((p) => (
                <ProblemCard key={p.title} p={p} />
              ))}
            </div>
          </details>
        )}
      </Card>
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

      <div className="space-y-4">
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <Card className="h-full">
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
          <Card className="h-full">
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
        </div>
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <Card className="h-full">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold">
                Busiest hours of the day
              </h2>
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
          <Card className="h-full">
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
        </div>
        <div className="grid items-stretch gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 [&>*]:h-full">
            <Card className="h-full">
              <CardContent className="p-0">
                <div className="border-b border-border px-5 py-3.5">
                  <h2 className="text-sm font-semibold">Recent sign-ins</h2>
                  <p className="text-xs text-muted-foreground">
                    The last 10 successful sign-ins: who, on what device, from
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
          </div>
          <div className="flex flex-col gap-4 [&>*]:flex-1">
            <Card className="h-full">
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
            <Card className="h-full">
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold">Most active people</h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  Actions saved in the last 7 days.
                </p>
                <HBars
                  items={m.topActors.map((x) => ({
                    label: x.name,
                    value: x.n,
                  }))}
                  color="hsl(var(--chart-2))"
                />
              </CardContent>
            </Card>
            <Card className="h-full">
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
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── tab: Speed & size ───────────────────────── */

export function SpeedPanel({ m }: { m: Monitor }) {
  const notSet = m.env.filter((e) => !e.set).length;
  return (
    <div className="space-y-4">
      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <Card className="h-full">
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
        <Card className="h-full">
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
        <div className="flex flex-col gap-4 [&>*]:flex-1">
          <Card className="h-full">
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold">This deployment</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                What is running right now.
              </p>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Build</dt>
                  <dd className="font-mono">{m.build.slice(0, 8)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Environment</dt>
                  <dd>{m.nodeEnv}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Node</dt>
                  <dd className="font-mono">{m.node}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Database link</dt>
                  <dd>{m.pooled ? "Pooled" : "Direct"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Your session</dt>
                  <dd className="text-right">Ends after 8 hours</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Working as someone</dt>
                  <dd className="text-right">Ends after 4 hours</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── tab: Sign-ins & security ───────────────────── */

export function SecurityPanel({ m, sec }: { m: Monitor; sec: Security }) {
  const s = m.security;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <HealthCard
          label="Failed sign-ins"
          value={formatNumber(sec.failed14)}
          detail="in 14 days"
          tone={s.failed24 >= 10 ? "warn" : "good"}
          statusText={s.failed24 >= 10 ? "Look" : "Quiet"}
          icon={UserX}
          meaning="Wrong password or a blocked account. A few are typing mistakes; a spike on one day, or many tries from one address, means someone is guessing."
        />
        <HealthCard
          label="Successful sign-ins"
          value={formatNumber(sec.ok14)}
          detail="in 14 days"
          tone="info"
          statusText="Sign-ins"
          icon={Users}
          meaning="Each time someone signed in with the right password, staff and customers together."
        />
        <HealthCard
          label="Developer sign-in locked"
          value={sec.lockedNow ? "Yes" : "No"}
          detail={`after ${DEVELOPER_LOCKOUT.perAddress} wrong tries in ${DEVELOPER_LOCKOUT.windowMinutes} minutes`}
          tone={sec.lockedNow ? "warn" : "good"}
          statusText={sec.lockedNow ? "Locked now" : "Open"}
          icon={Lock}
          meaning="The Developer account is refused for 15 minutes after repeated wrong passwords from one address, even if the right one is tried next. It opens again by itself."
        />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 [&>*]:h-full">
          <Card className="h-full">
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
                height={250}
                emptyText="No failed sign-ins or refused actions in 14 days. Good."
              />
              <Legend series={SECURITY_SERIES} className="mt-4" />
            </CardContent>
          </Card>
        </div>
        <Card className="h-full">
          <CardContent className="p-0">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Latest failed tries</h2>
              <p className="text-xs text-muted-foreground">
                Passwords are never stored. Repeats within a minute are merged
                (×N).
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

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <Card className="h-full">
          <CardContent className="p-0">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Failed tries by address</h2>
              <p className="text-xs text-muted-foreground">
                Last 7 days. One address trying many accounts is a warning sign.
              </p>
            </div>
            {sec.byAddress.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No wrong tries from any address in the last 7 days.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead className="text-right">Tries</TableHead>
                      <TableHead className="text-right">Accounts</TableHead>
                      <TableHead className="text-right">Last</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sec.byAddress.map((a) => (
                      <TableRow key={a.ip ?? "none"}>
                        <TableCell className="font-mono text-xs">
                          {a.ip ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {a.tries}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            a.accounts >= 3 && "font-semibold text-warning",
                          )}
                        >
                          {a.accounts}
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap text-right text-sm text-muted-foreground"
                          title={eat(a.last)}
                        >
                          {timeAgo(a.last)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardContent className="p-0">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold">Refused to you</h2>
              <p className="text-xs text-muted-foreground">
                The last times a page or an action was refused to the Developer
                account.
              </p>
            </div>
            {sec.refused.length === 0 ? (
              <p className="m-4 flex items-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
                <CheckCircle2 className="size-4" /> Nothing was refused to a
                Developer account.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {sec.refused.map((r) => (
                  <li key={r.id} className="px-5 py-2.5 text-sm">
                    <p className="leading-snug">{r.summary}</p>
                    <p
                      className="mt-0.5 text-xs text-muted-foreground"
                      title={eat(r.createdAt)}
                    >
                      {timeAgo(r.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <InfoCallout
        icon={KeyRound}
        tone={s.devLocked24 > 0 ? "warn" : "good"}
        title="Your Developer sign-in"
      >
        {s.devFailed24 === 0
          ? "No wrong-password tries on your account in the last 24 hours."
          : `${s.devFailed24} wrong-password tr${s.devFailed24 === 1 ? "y" : "ies"} in the last 24 hours${s.devLocked24 > 0 ? ", and it locked itself" : ""}. If these were not you, change your password.`}
      </InfoCallout>
    </div>
  );
}

/* ───────────────────────── tab: Settings ───────────────────────── */

export function SettingsPanel({ m }: { m: Monitor }) {
  const missingRequired = m.env.filter((e) => e.required && !e.set);
  const setCount = m.env.filter((e) => e.set).length;
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold">Settings</h3>
            <p className="text-xs text-muted-foreground">
              {missingRequired.length
                ? "Some required settings are missing — fix those first."
                : "All required settings are in place."}{" "}
              Only whether a setting exists is shown, never its value.
            </p>
          </div>
          <Badge variant={missingRequired.length ? "destructive" : "success"}>
            {setCount} of {m.env.length} set
          </Badge>
        </div>
        <ul className="divide-y divide-border md:grid md:grid-cols-2 md:divide-y-0">
          {m.env.map((e) => (
            <li
              key={e.name}
              className="border-border px-5 py-3 md:border-b md:odd:border-r"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {e.name}
                  </p>
                </div>
                <Badge
                  variant={
                    e.set ? "success" : e.required ? "destructive" : "warning"
                  }
                >
                  {e.set ? "Set" : e.required ? "Missing" : "Not set"}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {e.purpose}
              </p>
              {!e.set && (
                <p
                  className={cn(
                    "mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed",
                    e.required
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-warning",
                  )}
                >
                  <span className="font-semibold">Because it is missing: </span>
                  {e.ifMissing}
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
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
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h3 className="text-sm font-semibold">
                {formatNumber(totalUsers)} accounts
              </h3>
              <p className="text-xs text-muted-foreground">
                Grouped by what they do. Open Access to work as any of them.
              </p>
            </div>
            <Link
              href="/app/developer/accounts"
              className="text-xs font-medium text-primary hover:underline"
            >
              Open Access
            </Link>
          </div>
          <ul className="grid md:grid-cols-2">
            {roles.map((role) => {
              const info = ROLE_INFO[role];
              const c = byRole.get(role)!;
              const Icon = info.icon;
              return (
                <li
                  key={role}
                  className="flex items-center gap-3 border-b border-border px-5 py-3 md:odd:border-r"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {info.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {info.text}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {c.suspended > 0 && (
                      <Badge variant="destructive">
                        {c.suspended} suspended
                      </Badge>
                    )}
                    <Badge variant="success">{c.active} active</Badge>
                    <span className="w-6 text-right font-display text-xl font-semibold tabular-nums">
                      {c.total}
                    </span>
                  </span>
                </li>
              );
            })}
            {roles.length % 2 === 1 && (
              <li className="flex items-center gap-3 border-b border-border px-5 py-3 text-sm text-muted-foreground">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted">
                  <Users className="size-4" />
                </span>
                <span>
                  {formatNumber(totalUsers)} accounts in all,{" "}
                  {formatNumber(
                    [...byRole.values()].reduce((n, r) => n + r.active, 0),
                  )}{" "}
                  active.
                </span>
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <Card className="h-full">
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
        <div className="flex flex-col gap-4 [&>*]:flex-1">
          <InfoCallout
            className="h-full"
            icon={ShieldCheck}
            tone="good"
            title="Everything you do is on record"
          >
            Your name is attached to every action, including when you work as
            someone else. The records cannot be edited or deleted — not even by
            you.
          </InfoCallout>
          <InfoCallout
            className="h-full"
            icon={KeyRound}
            tone="warn"
            title="What you cannot do while working as someone"
          >
            Open accounts, change roles, reset or change passwords, suspend
            people. Everything else you may do as them, and it is all recorded
            as you. This stops Work as from being used to take over an account.
          </InfoCallout>
        </div>
      </div>
    </div>
  );
}
