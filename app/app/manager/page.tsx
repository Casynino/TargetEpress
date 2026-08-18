import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Info,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { ExecutiveDashboard } from "@/app/app/dashboard/executive";
import { DeskHero } from "@/components/app/desk-hero";
import { IconHint } from "@/components/app/icon-hint";
import { formatWeight } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { managerOverview, type Insight, type InsightTone } from "@/lib/manager-overview";
import { formatShillings } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Command centre" };

/**
 * The manager's command centre.
 *
 * THE SAME SCREEN THE OWNER READS, and that is the whole design. A manager who
 * runs the company day to day and an owner who answers for it need the same
 * four desks, the same money, the same list of things going wrong — asking the
 * two of them to compare notes across two dashboards computing revenue two ways
 * is how a business ends up with two sets of books and a meeting about which is
 * right.
 *
 * The difference between the chairs is authority, not information, and authority
 * is already enforced where it belongs: on the permissions behind each action.
 * The manager reads everything and presses everything except the five the owner
 * keeps — who works here, what the service costs, what the company's own
 * settings say, which bank accounts exist, and destroying a record for good.
 *
 * That sameness now reaches the top of the page too. This opened on a plain
 * title bar while every other desk was greeted by name, which said the manager
 * was a section of the system rather than a person running it.
 *
 * WHAT THIS CHAIR HAS THAT THE OWNER'S DOES NOT is the band between the two:
 * five sentences worth reading before any number, then the standing state of
 * operations, money, customers, staff and the decision queues. The dashboard
 * below answers "how is the business doing"; this band answers "what is
 * happening right now, and what is waiting on me" — which is the running of it.
 *
 * NOTHING HERE REPEATS A FIGURE THE DASHBOARD BELOW PRINTS. Consignments in the
 * warehouse, cargo cleared and not collected, delivered this month, outstanding
 * bills, total customers, total staff and the open-case count are all on that
 * screen already — as a stat chip, a money tile, a slice of the corridor ring or
 * a desk-pulse line — so they are computed in lib/manager-overview.ts and
 * deliberately not drawn a second time. A figure appearing twice on one screen
 * is read as a bug in the figure, not as emphasis.
 */
export default async function ManagerHome() {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();

  const [me, overview] = await Promise.all([
    // Read the name from the record, not the session. The session token carries
    // whatever the name was at sign-in, so someone who renames themselves would
    // be greeted by their old name until they signed out and back in.
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    }),
    managerOverview(locale),
  ]);
  const firstName = (me?.name ?? user.name).split(" ")[0];

  const today = new Date().toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const { operations, finance, customers, staff, management, rate } = overview;
  // Shillings lead, everywhere, through the one helper — a per-tile `rate ? … :
  // …` is how one block on a page ends up quoting a different currency from the
  // block beside it.
  const money = (usd: number) => formatShillings(usd, rate);
  const count = (n: number) => n.toLocaleString("en-US");

  return (
    <>
      <DeskHero
        firstName={firstName}
        role={user.role}
        today={today}
        // What this chair is for: the whole company, not one department's
        // corner of it — and the half of that which is standing still until
        // this person decides something.
        subtitle={t(
          locale,
          "Here is the whole business, and what is waiting on you."
        )}
        search={{ action: "/app/search" }}
      />

      <div className="mb-6 space-y-3">
        <Insights items={overview.insights} locale={locale} />

        <Block
          title={t(locale, "Operations")}
          href="/app/shipments"
          action={t(locale, "Every consignment")}
        >
          <Tile
            label={t(locale, "Loading in Guangzhou")}
            value={count(operations.batchesLoading)}
            hint={t(locale, "batches open or sealed")}
            href="/app/batches"
          />
          {/* "Flights", not "in the air": the ring below counts consignments in
              the air, and two different numbers under one label is worse than
              either being missing. */}
          <Tile
            label={t(locale, "Flights in the air")}
            value={count(operations.batchesInAir)}
            hint={t(locale, "batches, not consignments")}
            href="/app/receive"
          />
          <Tile
            label={t(locale, "Held, not cleared")}
            value={count(operations.cargoAwaitingPayment)}
            hint={t(locale, "Finance has not released them")}
            href="/app/finance/invoices?status=UNPAID"
            tone={operations.cargoAwaitingPayment > 0 ? "warn" : "flat"}
          />
          <Tile
            label={t(locale, "Weight on the floor")}
            value={formatWeight(operations.kgOnFloor)}
            hint={t(locale, "checked in and standing here")}
            href="/app/inventory"
          />
        </Block>

        <Block
          title={t(locale, "Money")}
          href="/app/finance"
          action={t(locale, "Full position")}
        >
          <Tile
            label={t(locale, "Billed today")}
            value={money(finance.revenueTodayUsd)}
            hint={t(locale, "invoiced, not yet money")}
            href="/app/finance/invoices"
          />
          <Tile
            label={t(locale, "Collected today")}
            value={money(finance.collectedTodayUsd)}
            hint={t(locale, "what customers handed over")}
            href="/app/finance/payments"
            tone={finance.collectedTodayUsd > 0 ? "good" : "flat"}
          />
          <Tile
            label={t(locale, "Spent today")}
            value={money(finance.expensesTodayUsd)}
            href="/app/finance/expenses"
          />
          <Tile
            label={t(locale, "Costs this month")}
            value={money(finance.expensesThisMonthUsd)}
            href="/app/finance/expenses"
          />
          {/* The one figure that says whether any of the rest was kept, and the
              dashboard below never states it. */}
          <Tile
            label={t(locale, "Profit this month")}
            value={money(finance.profitThisMonthUsd)}
            hint={
              finance.marginPct === null
                ? t(locale, "nothing billed yet")
                : `${Math.round(finance.marginPct)}% ${t(locale, "margin")}`
            }
            href="/app/finance"
            tone={finance.profitThisMonthUsd < 0 ? "bad" : "good"}
          />
          <Tile
            label={t(locale, "Credit outstanding")}
            value={money(finance.creditOutstandingUsd)}
            hint={t(locale, "released on a promise")}
            href="/app/finance/credit"
            tone={finance.creditOutstandingUsd > 0 ? "warn" : "flat"}
          />
          <Tile
            label={t(locale, "In the bank")}
            value={money(finance.bankUsd)}
            href="/app/finance/accounts"
          />
          <Tile
            label={t(locale, "Mobile money")}
            value={money(finance.mobileMoneyUsd)}
            href="/app/finance/accounts"
          />
          {/*
            "Cash & petty cash", one figure, and the label is the honest part.

            There is no petty-cash model in this schema — AccountKind is BANK,
            MOBILE_MONEY or CASH, and the office tin is a CASH account like the
            counter float. Splitting them would mean inventing the rule that
            decides which tin is petty, so they are added and named for what
            they are.
          */}
          <Tile
            label={t(locale, "Cash & petty cash")}
            value={money(finance.cashUsd)}
            hint={t(locale, "every cash account, tin included")}
            href="/app/finance/accounts"
          />
        </Block>

        <div className="grid gap-3 lg:grid-cols-3">
          <Block
            title={t(locale, "Customers")}
            href="/app/customers"
            action={t(locale, "Open")}
            columns="two"
          >
            <Tile
              label={t(locale, "New this month")}
              value={count(customers.newThisMonth)}
              href="/app/customers"
            />
            <Tile
              label={t(locale, "Using credit now")}
              value={count(customers.onCredit)}
              hint={t(locale, "carrying a live balance")}
              href="/app/finance/credit"
            />
            <Tile
              label={t(locale, "Past their due date")}
              value={count(customers.overdueOnCredit)}
              href="/app/finance/credit"
              tone={customers.overdueOnCredit > 0 ? "bad" : "flat"}
            />
            <Tile
              label={t(locale, "Waiting on our reply")}
              value={count(customers.awaitingReply)}
              hint={t(locale, "the next move is ours")}
              href="/app/support/tickets"
              tone={customers.awaitingReply > 0 ? "warn" : "flat"}
            />
          </Block>

          <Block
            title={t(locale, "Staff")}
            href="/app/admin/users"
            action={t(locale, "Everyone")}
            columns="two"
          >
            <Tile
              label={t(locale, "Seen today")}
              value={count(staff.seenToday)}
              hint={t(locale, "opened the app since midnight")}
              href="/app/admin/users"
            />
            <Tile
              label={t(locale, "Suspended")}
              value={count(staff.suspended)}
              hint={t(locale, "employed, barred from the system")}
              href="/app/admin/users"
              tone={staff.suspended > 0 ? "warn" : "flat"}
            />
            <Tile
              label={t(locale, "No salary set")}
              value={count(staff.withoutSalary)}
              hint={t(locale, "a payroll run skips them")}
              href="/app/admin/users"
              tone={staff.withoutSalary > 0 ? "warn" : "flat"}
            />
            <Tile
              label={t(locale, "Payroll")}
              value={staff.payroll ? staff.payroll.label : "—"}
              hint={
                staff.payroll
                  ? t(locale, PAYROLL_STATUS[staff.payroll.status] ?? "Status unknown")
                  : t(locale, "no run built yet")
              }
              href="/app/manager/payroll"
              tone={staff.payroll && staff.payroll.waiting > 0 ? "warn" : "flat"}
            />

            {/* The departments as a rail rather than five more tiles: this is
                one fact — the shape of the company — not five questions. */}
            <div className="col-span-2 flex flex-wrap gap-1.5 pt-1">
              {staff.byDepartment.map((row) => (
                <span
                  key={row.department}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                >
                  <span className="text-muted-foreground">
                    {t(locale, row.label)}
                  </span>
                  <span className="font-semibold tabular">{row.count}</span>
                </span>
              ))}
            </div>

            {/*
              Said out loud, because the figure above invites the wrong reading.

              This schema has no attendance: no shift, no clock-in, no roster of
              who was expected in. `lastActiveAt` is a heartbeat touched on every
              authenticated page load. Somebody on the warehouse floor all day
              who never opened the app is missing from "seen today", and somebody
              signed in from a bus is counted in it. A manager who read this as
              attendance would be disciplining the wrong person.
            */}
            <p className="col-span-2 text-[10px] leading-snug text-muted-foreground">
              {t(
                locale,
                "Attendance is not tracked. Seen today means the app was opened, nothing more."
              )}
            </p>
          </Block>

          <Block
            title={t(locale, "Waiting on you")}
            href="/app/manager/approvals"
            action={t(locale, "Every queue")}
            columns="two"
          >
            {/*
              The age, not just the count.

              Any one of these queues looks like a to-do list on its own screen.
              It is only beside the age of its oldest item that "eleven payments"
              becomes "eleven payments, the oldest nine days" — and nine days is
              the finding.
            */}
            <Tile
              label={t(locale, "Decisions queued")}
              value={count(management.pendingApprovals)}
              hint={
                management.oldestApprovalDays === null
                  ? t(locale, "nothing is sitting")
                  : `${t(locale, "oldest")} ${management.oldestApprovalDays}${t(locale, "d")}`
              }
              href="/app/manager/approvals"
              tone={
                (management.oldestApprovalDays ?? 0) >= 3
                  ? "bad"
                  : management.pendingApprovals > 0
                    ? "warn"
                    : "flat"
              }
            />
            <Tile
              label={t(locale, "Flights to sign off")}
              value={count(management.statements.waiting)}
              hint={
                management.statements.oldestDays === null
                  ? t(locale, "Finance has closed nothing new")
                  : `${t(locale, "oldest")} ${management.statements.oldestDays}${t(locale, "d")}`
              }
              href="/app/manager/reconciliation"
              tone={management.statements.waiting > 0 ? "warn" : "flat"}
            />
            <Tile
              label={t(locale, "Payroll to agree")}
              value={count(management.payrollWaiting)}
              hint={t(locale, "salaries wait until you do")}
              href="/app/manager/payroll"
              tone={management.payrollWaiting > 0 ? "bad" : "flat"}
            />
            <Tile
              label={t(locale, "Prices to confirm")}
              value={count(
                management.queues.find((queue) => queue.key === "drafts")?.count ?? 0
              )}
              hint={t(locale, "cannot be billed until confirmed")}
              href="/app/finance/invoices?status=DRAFT"
            />
          </Block>
        </div>
      </div>

      <ExecutiveDashboard role={user.role} />
    </>
  );
}

/** Where a salary run has got to, in the words this desk uses for it. */
const PAYROLL_STATUS: Record<string, string> = {
  DRAFT: "Still with Finance",
  PENDING_APPROVAL: "Waiting on you",
  APPROVED: "Agreed — not yet paid",
  REJECTED: "Sent back to Finance",
  PAID: "Paid",
};

// ---------------------------------------------------------------------------
// The dense furniture
// ---------------------------------------------------------------------------

const TONES = {
  flat: "text-foreground",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
} as const;

/**
 * One figure, at the size a figure needs and no larger.
 *
 * The owner has said twice that these screens must not take much space, so this
 * is a label, a number and a line of context inside a padded link — not a card.
 * KpiCard and MoneyTile are the right shape for the four headline figures on a
 * dashboard; twenty-five of them would be a scroll, which is the one thing this
 * page cannot be.
 *
 * Every one carries an href, because a figure a manager cannot open is a figure
 * they have to go and hunt for on another screen.
 */
function Tile({
  label,
  value,
  hint,
  href,
  tone = "flat",
}: {
  label: string;
  value: string;
  hint?: string;
  href: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <Link
      href={href}
      className="focus-ring group rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60"
    >
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate font-display text-[15px] font-bold leading-tight tabular",
          TONES[tone]
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </Link>
  );
}

/**
 * A named group of figures.
 *
 * The heading sits INSIDE the panel rather than on a SectionLabel above it:
 * three of these stand side by side in one row, and a rule above each column
 * would read as three separate sections of the page instead of one band.
 */
function Block({
  title,
  href,
  action,
  children,
  columns = "wide",
}: {
  title: string;
  href: string;
  action: string;
  children: React.ReactNode;
  columns?: "wide" | "two";
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card p-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        <Link
          href={href}
          className="focus-ring inline-flex shrink-0 items-center gap-1 rounded text-[11px] font-semibold text-brand hover:underline"
        >
          {action}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div
        className={cn(
          "grid gap-x-2 gap-y-1",
          columns === "two"
            ? "grid-cols-2"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        )}
      >
        {children}
      </div>
    </section>
  );
}

const INSIGHT_TONES: Record<
  InsightTone,
  { icon: LucideIcon; chip: string; name: string }
> = {
  good: { icon: TrendingUp, chip: "bg-success/10 text-success", name: "Good news" },
  warn: { icon: AlertTriangle, chip: "bg-warning/10 text-warning", name: "Watch this" },
  bad: { icon: TrendingDown, chip: "bg-destructive/10 text-destructive", name: "Bad news" },
  neutral: { icon: Info, chip: "bg-muted text-muted-foreground", name: "Worth knowing" },
};

/**
 * The point of the page, which is why it is the first thing on it.
 *
 * A dashboard states figures; a manager needs the reading of them. These are
 * comparisons and ages — "up 18% on last month", "waiting six days" — because a
 * figure answers how much and only a comparison answers whether that is good.
 * They are ordered by how much each ought to change a decision this morning,
 * never by the order a query happened to return.
 */
function Insights({
  items,
  locale,
}: {
  items: Insight[];
  locale: Locale;
}) {
  if (items.length === 0) {
    /* A clear month still gets a sentence. An empty panel reads as a screen
       that failed to load, not as a business with nothing to report. */
    return (
      <section className="rounded-xl border bg-card px-3 py-2.5 text-[11px] text-muted-foreground">
        {t(
          locale,
          "Nothing has moved enough to be worth a sentence. The figures below are the whole story."
        )}
      </section>
    );
  }

  return (
    <section className="divide-y rounded-xl border bg-card">
      {items.map((item) => {
        const tone = INSIGHT_TONES[item.tone];
        const Icon = tone.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            className="focus-ring group flex items-center gap-2.5 px-3 py-2 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50"
          >
            <IconHint label={t(locale, tone.name)}>
              <span
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                  tone.chip
                )}
              >
                <Icon className="h-3 w-3" />
              </span>
            </IconHint>
            <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug">
              {item.text}
            </p>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        );
      })}
    </section>
  );
}
