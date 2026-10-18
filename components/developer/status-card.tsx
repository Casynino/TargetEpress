import { Card, CardContent } from "@/components/ui/card";
import { MiniBars, Sparkline } from "@/components/developer/charts";
import type { Errors } from "@/lib/developer/events";
import type { Monitor } from "@/lib/developer/monitor";
import { formatNumber } from "@/lib/developer/format";
import { cn } from "@/lib/utils";

/**
 * The verdict and the numbers that matter, in one calm card under the banner:
 * the health dial, a plain sentence, and four live numbers, each with its
 * recent trend.
 */

type Level = "good" | "warn" | "bad";

const COLOR: Record<Level, string> = {
  good: "hsl(var(--success))",
  warn: "hsl(var(--warning))",
  bad: "hsl(var(--destructive))",
};
const TEXT: Record<Level, string> = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
};

const sum = (row: Record<string, unknown>) =>
  Object.entries(row).reduce(
    (s, [k, v]) => (k === "day" ? s : s + (Number(v) || 0)),
    0,
  );

function Dial({ score, level }: { score: number; level: Level }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div
        className="relative size-28 sm:size-32"
        role="img"
        aria-label={`Health score ${score} out of 100`}
      >
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={9}
          />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={COLOR[level]}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * c} ${c}`}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-4xl font-bold leading-none tabular-nums">
              {score}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              out of 100
            </p>
          </div>
        </div>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Health score
      </p>
    </div>
  );
}

function Chip({ n, label, dot }: { n: number; label: string; dot: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground/80">
      <span
        className={cn(
          "size-1.5 rounded-full",
          n > 0 ? dot : "bg-muted-foreground/40",
        )}
      />
      <span className="tabular-nums">{n}</span> {label}
    </span>
  );
}

function Metric({
  label,
  value,
  hint,
  valueClass,
  visual,
}: {
  label: string;
  value: string;
  hint: string;
  valueClass?: string;
  visual: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border bg-muted/30 p-4">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 whitespace-nowrap font-display text-3xl font-bold leading-none tabular-nums",
          valueClass,
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p>
      <div className="mt-auto pt-3">{visual}</div>
    </div>
  );
}

export function StatusCard({ m, errors }: { m: Monitor; errors: Errors }) {
  const crit = m.problems.filter((p) => p.level === "critical").length;
  const warn = m.problems.filter((p) => p.level === "warning").length;
  const info = m.problems.length - crit - warn;
  const level: Level = crit ? "bad" : warn ? "warn" : "good";
  const headline = crit
    ? "Needs attention now"
    : warn
      ? "Working, with a few things to look at"
      : "Everything is healthy";
  const summary = crit
    ? `${crit} thing${crit > 1 ? "s are" : " is"} broken and should be fixed now.`
    : warn
      ? `${warn} thing${warn > 1 ? "s" : ""} worth a look. Nothing is broken.`
      : "The database is fast, every required setting is in place and nothing has crashed.";

  const dbLevel: Level =
    !m.dbOk || m.avgMs >= 400 ? "bad" : m.avgMs >= 150 ? "warn" : "good";
  const crashes = errors.kinds24;

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <Dial score={m.score} level={level} />
          <div className="min-w-0">
            <p
              className={cn(
                "font-display text-xl font-semibold leading-tight",
                TEXT[level],
              )}
            >
              {headline}
            </p>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {summary}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip n={crit} label="to fix now" dot="bg-destructive" />
              <Chip n={warn} label="to look at" dot="bg-warning" />
              <Chip n={info} label="for information" dot="bg-info" />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Database"
            value={m.dbOk ? "Online" : "Down"}
            valueClass={TEXT[dbLevel]}
            hint={
              m.dbOk
                ? `${m.dbMs} ms · ${m.pooled ? "pooled" : "not pooled"}`
                : "cannot connect"
            }
            visual={
              <MiniBars
                className="h-8 w-full"
                floor={60}
                values={m.probes.map((p) => p.ms)}
                colors={m.probes.map(
                  (p) =>
                    COLOR[
                      !p.ok || p.ms >= 400
                        ? "bad"
                        : p.ms >= 150
                          ? "warn"
                          : "good"
                    ],
                )}
              />
            }
          />
          <Metric
            label="Signed in today"
            value={formatNumber(m.signedIn24)}
            hint="different people"
            visual={
              <Sparkline
                className="h-8 w-full"
                id="status-signins"
                color="hsl(var(--primary))"
                values={m.loginSeries.map((r) =>
                  sum(r as unknown as Record<string, unknown>),
                )}
              />
            }
          />
          <Metric
            label="Actions today"
            value={formatNumber(m.activity24h)}
            hint="saved in 24 hours"
            visual={
              <Sparkline
                className="h-8 w-full"
                id="status-actions"
                color="hsl(var(--primary))"
                values={m.activitySeries.map((r) => r.staff + r.dev)}
              />
            }
          />
          <Metric
            label="Crashes today"
            value={formatNumber(crashes)}
            valueClass={crashes ? "text-destructive" : undefined}
            hint={crashes > 0 ? "pages that broke" : "nothing broke"}
            visual={
              <Sparkline
                className="h-8 w-full"
                id="status-crashes"
                color={crashes ? COLOR.bad : "hsl(var(--muted-foreground))"}
                values={errors.series.map((r) => r.n)}
              />
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
