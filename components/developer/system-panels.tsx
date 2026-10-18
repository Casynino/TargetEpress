import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  CircleHelp,
  ListChecks,
  Timer,
  Wrench,
  XCircle,
} from "lucide-react";

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
import type { CheckResult } from "@/lib/developer/diagnose";
import type { Errors } from "@/lib/developer/events";
import { eat, formatNumber, timeAgo } from "@/lib/developer/format";
import type { JobRow } from "@/lib/developer/jobs";
import { cn } from "@/lib/utils";

const STATUS = {
  fix: {
    icon: XCircle,
    text: "Needs fixing",
    tone: "text-destructive",
    badge: "destructive" as const,
  },
  look: {
    icon: AlertTriangle,
    text: "Look at it",
    tone: "text-warning",
    badge: "warning" as const,
  },
  unknown: {
    icon: CircleHelp,
    text: "Could not be checked",
    tone: "text-muted-foreground",
    badge: "muted" as const,
  },
  ok: {
    icon: CheckCircle2,
    text: "Fine",
    tone: "text-success",
    badge: "success" as const,
  },
};

/** Every rule the system promises, and how each came out just now. */
export function ChecksPanel({ checks }: { checks: CheckResult[] }) {
  const count = (st: CheckResult["status"]) =>
    checks.filter((c) => c.status === st).length;
  const ok = count("ok");
  const open = checks.filter((c) => c.status !== "ok");
  const groups = [
    ...new Set(checks.filter((c) => c.status === "ok").map((c) => c.group)),
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          label="Checks fine"
          value={`${ok} of ${checks.length}`}
          detail="system checks just now"
          tone={ok === checks.length ? "good" : "info"}
          statusText={ok === checks.length ? "All good" : "Mostly fine"}
          icon={ListChecks}
          meaning="These are problems of the system, not of the business's work. Tickets, flights and payments waiting on staff are not checked here."
        />
        <HealthCard
          label="Needs fixing"
          value={formatNumber(count("fix"))}
          detail="the system is broken here"
          tone={count("fix") ? "bad" : "good"}
          statusText={count("fix") ? "Fix now" : "None"}
          icon={Wrench}
          meaning="Something the system promises is not true, or something it cannot run without is missing."
        />
        <HealthCard
          label="Look at"
          value={formatNumber(count("look"))}
          detail="not broken, but worth a look"
          tone={count("look") ? "warn" : "good"}
          statusText={count("look") ? "Look" : "None"}
          icon={AlertTriangle}
          meaning="Odd, and probably wrong, but nothing is stopped by it."
        />
        <HealthCard
          label="Could not be checked"
          value={formatNumber(count("unknown"))}
          detail="nothing is known about them"
          tone="neutral"
          statusText="Not a problem found"
          icon={CircleHelp}
          meaning="The database refused the question just now, or the check does not apply. Nothing is known about these either way."
        />
      </div>

      {open.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {open.map((c) => {
                const st = STATUS[c.status];
                const Icon = st.icon;
                return (
                  <li
                    key={c.label}
                    className="flex items-start gap-3 px-5 py-3"
                  >
                    <Icon className={cn("mt-0.5 size-4 shrink-0", st.tone)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {c.label}
                      </span>
                      {c.note && (
                        <span className="block break-words text-xs text-muted-foreground">
                          {c.note}
                        </span>
                      )}
                    </span>
                    <Badge variant={st.badge}>{st.text}</Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
              <CheckCircle2 className="size-4 text-success" />
              <span className="text-sm font-medium">All good</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                {ok}
              </span>
              <span className="ml-auto text-xs text-muted-foreground group-open:hidden">
                Show what was checked
              </span>
              <span className="ml-auto hidden text-xs text-muted-foreground group-open:inline">
                Hide
              </span>
            </summary>
            <div className="grid gap-x-8 gap-y-4 border-t border-border px-5 py-4 md:grid-cols-2">
              {groups.map((g) => (
                <div key={g}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g}
                  </p>
                  <ul className="space-y-1">
                    {checks
                      .filter((c) => c.status === "ok" && c.group === g)
                      .map((c) => (
                        <li
                          key={c.label}
                          className="flex items-start gap-2 text-sm"
                        >
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                          {c.label}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

const JOB_STATE: Record<
  JobRow["state"],
  { text: string; variant: "success" | "destructive" | "warning" | "muted" }
> = {
  ok: { text: "On time", variant: "success" },
  late: { text: "Late", variant: "warning" },
  failed: { text: "Failed", variant: "destructive" },
  unknown: { text: "Not recorded yet", variant: "muted" },
};

/** Server errors the app recorded for itself, and whether its scheduled jobs ran. */
export function ErrorsJobsPanel({
  errors,
  jobs,
}: {
  errors: Errors;
  jobs: JobRow[];
}) {
  const onTime = jobs.filter((j) => j.state === "ok").length;
  const lastRun = jobs
    .map((j) => j.lastRun)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          label="Server errors"
          value={formatNumber(errors.kinds24)}
          detail="different errors in 24 hours"
          tone={errors.kinds24 ? "bad" : "good"}
          statusText={errors.kinds24 ? "Look" : "Quiet"}
          icon={Bug}
          meaning="Errors the server did not expect. The same error again counts once here; its line below says how many times."
        />
        <HealthCard
          label="Automatic jobs"
          value={`${onTime} of ${jobs.length}`}
          detail="on time and well"
          tone={
            jobs.some((j) => j.state === "late" || j.state === "failed")
              ? "warn"
              : jobs.every((j) => j.state === "unknown")
                ? "neutral"
                : "good"
          }
          statusText={
            jobs.every((j) => j.state === "unknown")
              ? "Not recorded yet"
              : onTime === jobs.length
                ? "All on time"
                : "Look"
          }
          icon={Timer}
          meaning="What the system runs by itself on a timer. Late means it has not completed for one and a half times its usual gap."
        />
        <HealthCard
          label="Last error"
          value={errors.last ? timeAgo(errors.last) : "None"}
          detail={errors.last ? eat(errors.last) : "nothing recorded yet"}
          tone="neutral"
          statusText="Server"
          icon={Bug}
          meaning="When the server last recorded an unexpected error."
        />
        <HealthCard
          label="Last job run"
          value={lastRun ? timeAgo(lastRun) : "None yet"}
          detail={lastRun ? eat(lastRun) : "the first run is tonight"}
          tone="neutral"
          statusText="Schedule"
          icon={Timer}
          meaning="When any automatic job last wrote its diary line."
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-5 py-3.5">
            <h3 className="text-sm font-semibold">Server errors</h3>
            <p className="text-xs text-muted-foreground">
              Last 30 days, one line for each different error. A repeat adds to
              its count; emails and numbers are taken out.
            </p>
          </div>
          {errors.grouped.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-success">
              Nothing yet. No unexpected server error has been recorded.
              <span className="mt-1 block text-xs text-muted-foreground">
                Mistakes people make, like a wrong password or a refused action,
                are not errors and are not recorded here.
              </span>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>What went wrong</TableHead>
                    <TableHead>Where</TableHead>
                    <TableHead className="text-right">Times</TableHead>
                    <TableHead className="text-right">Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.grouped.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-md text-sm">
                        {e.message}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {e.path ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.n}
                      </TableCell>
                      <TableCell
                        className="whitespace-nowrap text-right text-sm text-muted-foreground"
                        title={eat(e.last)}
                      >
                        {timeAgo(e.last)}
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
            <h3 className="text-sm font-semibold">Automatic jobs</h3>
            <p className="text-xs text-muted-foreground">
              What the system runs by itself on a timer. Tanzania time. A job
              writes a line each time it runs.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Runs at</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Last time it went well</TableHead>
                  <TableHead>Last result</TableHead>
                  <TableHead className="text-right">Took</TableHead>
                  <TableHead className="text-right">On time?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.key}>
                    <TableCell>
                      <span className="block text-sm font-medium">
                        {j.name}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {j.path}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      Every day {j.runsAt}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-sm text-muted-foreground"
                      title={j.lastRun ? eat(j.lastRun) : undefined}
                    >
                      {j.lastRun ? timeAgo(j.lastRun) : "Not recorded yet"}
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-sm text-muted-foreground"
                      title={j.lastGood ? eat(j.lastGood) : undefined}
                    >
                      {j.lastGood ? timeAgo(j.lastGood) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {j.detail ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground">
                      {j.ms !== null ? `${(j.ms / 1000).toFixed(1)} s` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={JOB_STATE[j.state].variant}>
                        {JOB_STATE[j.state].text}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
