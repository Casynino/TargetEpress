import type { Metadata } from "next";
import Link from "next/link";
import type { Role } from "@prisma/client";
import {
  ArrowRight,
  Boxes,
  Clock,
  PlaneTakeoff,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { DeskPulsePanel } from "@/components/app/desk-pulse";
import { IconHint } from "@/components/app/icon-hint";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { chargeableStorageDays } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import {
  managerOperations,
  type OpsBatch,
  type OpsDesk,
  type OpsLeg,
  type OpsStage,
} from "@/lib/manager-operations";
import { deskPulse } from "@/lib/queries";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Operations" };

/**
 * The whole cargo journey on one screen, and every desk underneath it.
 *
 * The manager's day is one question asked repeatedly — where has cargo stopped
 * moving, and who is it waiting on — and until now answering it meant opening
 * Guangzhou's floor, the receiving bench, the Dar warehouse and the support
 * desk in four tabs and holding the four in their head. Four screens cannot be
 * compared by opening them one at a time, which is the same argument that put
 * the desk cards on the owner's dashboard; this page makes it about the CARGO
 * rather than about the departments, and then shows the departments below it.
 *
 * Read the bar first and then left to right: what is in the air, then
 * registered in Guangzhou, loaded, sealed — and on the right, landed, checked
 * in, cleared, collected, and what has overstayed.
 *
 * EVERY FIGURE IS A LINK INTO THE LIST THAT PROVES IT. A count a manager cannot
 * open is a count they have to take on trust, and one they cannot check is one
 * they cannot challenge. Where a reader lacks the permission for the screen
 * behind a figure — Finance reaches this page and holds neither inventory.view
 * nor batch.receive — the number still shows and the arrow does not, the same
 * idiom the approvals board uses: knowing a desk is behind is the job even when
 * opening its bench is not.
 *
 * Guarded on batch.view rather than report.view. The prefix guard in
 * lib/rbac.ts already asks for report.view before the route opens at all, so
 * this is the second lock and it asks the question this page is actually about:
 * may this person see the cargo pipeline.
 */
export default async function ManagerOperationsPage() {
  const user = await requirePermission("batch.view");
  // Before the Promise.all. deskPulse() below reads `locale` from inside a
  // callback, and a const referenced by a closure that runs first is a temporal
  // dead zone TypeScript cannot see — the page then dies at runtime.
  const locale = await viewerLocale();

  const [ops, desks] = await Promise.all([
    managerOperations(locale),
    currentRate().then((row) => deskPulse(row ? toNumber(row.rate) : null, locale)),
  ]);

  const corridorOpen = can(user.role, ops.corridor.permission);

  return (
    <>
      <PageHeader
        title={t(locale, "Operations")}
        description={t(
          locale,
          "The whole journey, Guangzhou to collection, and what every desk is doing to it."
        )}
      />

      {/*
        The cargo that is between the two columns rather than in either of them.

        Above them, not wedged between them: it belongs to neither warehouse,
        and on a phone the columns stack — a bar sitting between the two would
        read as the bottom of Guangzhou rather than as the flight. Leading the
        page is right anyway, because this is the only cargo on the screen that
        nobody can touch today.
      */}
      <ProofRow
        href={ops.corridor.href}
        open={corridorOpen}
        className="mb-3 border-info/30 bg-info/[0.04]"
      >
        <IconHint label={t(locale, "In the air")}>
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-info/10 text-info">
            <PlaneTakeoff className="h-3.5 w-3.5" />
          </span>
        </IconHint>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">
            {t(locale, "In the air right now")}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {ops.corridor.batches.toLocaleString()} {t(locale, "flights")} ·{" "}
            {Math.round(ops.corridor.weightKg).toLocaleString()} {t(locale, "kg")}
          </span>
        </span>
        <span className="tabular text-lg font-bold leading-none text-info">
          {ops.corridor.cargo.toLocaleString()}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {t(locale, "pieces")}
        </span>
        {corridorOpen ? <Arrow /> : null}
      </ProofRow>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Leg leg={ops.china} role={user.role} locale={locale} icon={Boxes} />
        <Leg leg={ops.dar} role={user.role} locale={locale} icon={Warehouse}>
          {/* The end of the journey, and the only place a "closed" batch is
              named — a table in Guangzhou is emptied by being dispatched, and
              the books are shut here, after Dar has ticked every box off. */}
          {ops.lastClosed ? (
            <ProofRow
              href={ops.lastClosed.href}
              open={can(user.role, "batch.view")}
              className="mt-1 border-dashed"
            >
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {t(locale, "Books last closed")}{" "}
                <span className="font-medium text-foreground">
                  {ops.lastClosed.batchNumber}
                </span>
              </span>
              {ops.lastClosed.days !== null ? (
                <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                  {ops.lastClosed.days} {t(locale, "days ago")}
                </span>
              ) : null}
            </ProofRow>
          ) : null}
        </Leg>
      </div>

      {/*
        DAYS, NEVER A CHARGE. The owner's standing rule: delayed cargo shows how
        long it has been standing, and what that costs is worked out at the
        counter when somebody actually pays. A storage figure in shillings on an
        operations screen would be quoting a customer a number nobody has agreed.
      */}
      <div className="mt-5">
        {/* No count chip. The chip means "this many rows below", and what a
            manager wants counted here is the whole overdue set — which is
            already the last figure in the Dar column. One number meaning two
            things on one screen is worse than one number said once. */}
        <SectionLabel
          action={
            can(user.role, "inventory.view")
              ? { href: "/app/inventory", label: t(locale, "The whole floor") }
              : undefined
          }
        >
          {t(locale, "Longest standing on the floor")}
        </SectionLabel>

        {ops.storage.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground">
            {t(locale, "Nothing is standing in the warehouse.")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {ops.storage.rows.map((row) => {
              const over = chargeableStorageDays(row.days) > 0;
              return (
                <li key={row.id}>
                  <ProofRow href={row.href} open={can(user.role, "shipment.view")}>
                    <IconHint
                      label={
                        over
                          ? `${t(locale, "Past the free")} ${ops.storage.freeDays} ${t(locale, "days")}`
                          : t(locale, "Inside the free window")
                      }
                    >
                      <span
                        className={cn(
                          "grid h-6 w-6 place-items-center rounded-md",
                          over
                            ? "bg-warning/10 text-warning"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Clock className="h-3 w-3" />
                      </span>
                    </IconHint>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {row.trackingNumber}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {row.customer}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "tabular shrink-0 text-sm font-semibold",
                        over ? "text-warning" : "text-muted-foreground"
                      )}
                    >
                      {row.days}
                      <span className="ml-1 text-[11px] font-normal">
                        {t(locale, "days")}
                      </span>
                    </span>
                  </ProofRow>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <SectionLabel>{t(locale, "Every desk, right now")}</SectionLabel>
        {/* The company's own panel, rendered here rather than reworded: the
            manager and the owner must read the same sentence about the same
            desk, or the two of them are comparing notes across two versions of
            one fact. */}
        <DeskPulsePanel desks={desks} locale={locale} />

        {/* Same four columns, same order, so each card sits under the desk it
            belongs to: the pulse says what is wrong there, these three rows say
            what is queued, what got finished today, and what is still open. */}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {ops.desks.map((desk) => (
            <DeskDetail key={desk.key} desk={desk} role={user.role} locale={locale} />
          ))}
        </div>
      </div>
    </>
  );
}

/** The arrow that says a row opens something. Decorative — the row is the link. */
function Arrow() {
  return (
    <ArrowRight
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
    />
  );
}

/**
 * A row that either opens the list behind it or does not.
 *
 * One component rather than a link and a div written out at each call site,
 * because "the reader cannot reach this screen" happens on nine of the rows
 * here and the two shapes have to stay identical — a figure that shifts by two
 * pixels depending on the reader's role reads as a rendering bug.
 */
function ProofRow({
  href,
  open,
  className,
  children,
}: {
  href: string;
  open: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const shape = cn(
    "flex w-full items-center gap-2 rounded-xl border bg-card px-3 py-2",
    open
      ? "focus-ring group transition-colors hover:border-brand/40 hover:bg-accent/40"
      : "cursor-default",
    className
  );

  return open ? (
    <Link href={href} className={shape}>
      {children}
    </Link>
  ) : (
    <div className={shape}>{children}</div>
  );
}

/** One end of the corridor: its headline, its stages, and its batches. */
function Leg({
  leg,
  role,
  locale,
  icon: Icon,
  children,
}: {
  leg: OpsLeg;
  role: Role;
  locale: Locale;
  icon: LucideIcon;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        <IconHint label={leg.place}>
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10 text-brand">
            <Icon className="h-3.5 w-3.5" />
          </span>
        </IconHint>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm font-bold">
            {leg.place}
          </span>
          {leg.standingDetail ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {leg.standingDetail}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right">
          <span className="tabular block text-xl font-bold leading-none">
            {leg.standing.toLocaleString()}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {leg.standingLabel}
          </span>
        </span>
      </header>

      <ul className="divide-y">
        {leg.stages.map((stage) => (
          <li key={stage.key}>
            <StageRow stage={stage} role={role} />
          </li>
        ))}
      </ul>

      <div className="border-t p-2">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {leg.batchesLabel}
          </span>
          {can(role, leg.batchesPermission) ? (
            <Link
              href={leg.batchesHref}
              className="focus-ring shrink-0 rounded text-[11px] font-semibold text-brand hover:underline"
            >
              {t(locale, "All")}
            </Link>
          ) : null}
        </div>

        {leg.batches.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
            {leg.batchesEmpty}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {leg.batches.map((batch) => (
              <li key={batch.id}>
                <BatchRow batch={batch} role={role} locale={locale} />
              </li>
            ))}
          </ul>
        )}

        {children}
      </div>
    </section>
  );
}

/** One stage of the journey: what it is, how much is sitting in it, and proof. */
function StageRow({ stage, role }: { stage: OpsStage; role: Role }) {
  const open = can(role, stage.permission);
  const loud = stage.tone === "warn" && stage.value > 0;

  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{stage.label}</span>
        {stage.detail ? (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {stage.detail}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "tabular shrink-0 text-sm font-semibold",
          loud ? "text-warning" : "text-foreground"
        )}
      >
        {stage.value.toLocaleString()}
      </span>
      {open ? <Arrow /> : null}
    </>
  );

  return open ? (
    <Link
      href={stage.href}
      className="focus-ring group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-accent/40"
    >
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-2 px-3 py-2">{body}</div>
  );
}

/** A batch, clickable through to the batch itself. */
function BatchRow({
  batch,
  role,
  locale,
}: {
  batch: OpsBatch;
  role: Role;
  locale: Locale;
}) {
  return (
    <ProofRow href={batch.href} open={can(role, "batch.view")} className="py-1.5">
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-xs font-semibold">{batch.batchNumber}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {batch.origin}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {batch.state}
          {batch.cargo !== null
            ? ` · ${batch.cargo.toLocaleString()} ${t(locale, "pieces")}`
            : ""}
          {batch.note ? ` · ${batch.note}` : ""}
        </span>
      </span>
      {/* Days, because that is what a flight standing still costs the business
          in the only unit this app counts delay in. */}
      {batch.days !== null ? (
        <span className="shrink-0 text-right">
          <span className="tabular block text-xs font-semibold">
            {batch.days}
            <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">
              {t(locale, "d")}
            </span>
          </span>
          {batch.daysLabel ? (
            <span className="block text-[11px] text-muted-foreground">
              {batch.daysLabel}
            </span>
          ) : null}
        </span>
      ) : null}
      {can(role, "batch.view") ? <Arrow /> : null}
    </ProofRow>
  );
}

/** What deskPulse does not carry: queued, finished today, still open. */
function DeskDetail({
  desk,
  role,
  locale,
}: {
  desk: OpsDesk;
  role: Role;
  locale: Locale;
}) {
  const HEAD: Record<string, string> = {
    pending: "waiting",
    today: "today",
    issues: "open",
  };

  return (
    <section className="rounded-xl border bg-card p-2">
      <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {desk.desk}
      </p>
      <ul className="space-y-0.5">
        {desk.rows.map((row) => {
          const open = can(role, row.permission);
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium">
                  {row.label}
                </span>
                {row.detail ? (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {row.detail}
                  </span>
                ) : null}
              </span>
              <span className="tabular shrink-0 text-sm font-semibold">
                {row.value.toLocaleString()}
              </span>
              <span className="w-8 shrink-0 text-right text-[11px] text-muted-foreground">
                {t(locale, HEAD[row.key])}
              </span>
            </>
          );

          return (
            <li key={row.key}>
              {open ? (
                <Link
                  href={row.href}
                  className="focus-ring group flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-accent/40"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-2 px-1 py-1">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
