import "server-only";

import type { Problem } from "@/lib/developer/monitor";
import { describe } from "@/lib/developer/safe";
import { prisma } from "@/lib/prisma";

/**
 * The automatic jobs, as the schedule in vercel.json declares them. Kept here
 * by hand and checked against vercel.json by `check:developer`, so a job added
 * to the schedule cannot go unwatched.
 */
export const JOBS = [
  {
    key: "storage",
    name: "Storage charging",
    path: "/api/cron/storage",
    /** Tanzania time. vercel.json says 03:05 UTC. */
    runsAt: "06:05",
    gapHours: 24,
  },
] as const;

export type JobRow = {
  key: string;
  name: string;
  path: string;
  runsAt: string;
  lastRun: Date | null;
  lastOk: boolean | null;
  lastGood: Date | null;
  ms: number | null;
  detail: string | null;
  /** ok = ran in time and went well, late, failed, or unknown = no run recorded yet. */
  state: "ok" | "late" | "failed" | "unknown";
};

type Meta = {
  outcome?: string;
  ms?: number;
  charged?: number;
  looked?: number;
  failed?: number;
};

export async function getJobs(): Promise<{
  rows: JobRow[];
  problems: Problem[];
  failures: string[];
}> {
  const failures: string[] = [];
  const problems: Problem[] = [];
  const rows: JobRow[] = [];
  for (const job of JOBS) {
    try {
      const [last, good] = await Promise.all([
        prisma.auditLog.findFirst({
          where: { action: "job.run", entityId: job.key },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, metadata: true, summary: true },
        }),
        prisma.auditLog.findFirst({
          where: {
            action: "job.run",
            entityId: job.key,
            metadata: { path: ["outcome"], equals: "success" },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
      ]);
      const meta = (last?.metadata ?? {}) as Meta;
      const lastOk = last ? meta.outcome === "success" : null;
      const late =
        !good ||
        Date.now() - good.createdAt.getTime() > job.gapHours * 1.5 * 3_600_000;
      const state: JobRow["state"] = !last
        ? "unknown"
        : lastOk === false
          ? "failed"
          : late
            ? "late"
            : "ok";
      rows.push({
        key: job.key,
        name: job.name,
        path: job.path,
        runsAt: job.runsAt,
        lastRun: last?.createdAt ?? null,
        lastOk,
        lastGood: good?.createdAt ?? null,
        ms: typeof meta.ms === "number" ? meta.ms : null,
        detail:
          last && meta.looked !== undefined
            ? `looked at ${meta.looked}, charged ${meta.charged ?? 0}${meta.failed ? `, ${meta.failed} failed` : ""}`
            : (last?.summary ?? null),
        state,
      });
      if (state === "failed")
        problems.push({
          level: "warning",
          title: `${job.name} failed on its last run`,
          detail: last?.summary ?? "The last run reported a failure.",
          hint: `Open Vercel → Cron Jobs → ${job.path} and read the log of that run. You can run it again from Finance → Storage once the cause is fixed.`,
        });
      else if (state === "late")
        problems.push({
          level: "warning",
          title: `${job.name} has not run on time`,
          detail: `It should run every day at ${job.runsAt} Tanzania time and has not completed for more than ${Math.round(job.gapHours * 1.5)} hours.`,
          hint: `Check that CRON_SECRET is set (Settings), then Vercel → Cron Jobs → ${job.path}. A deploy that removed vercel.json's crons would also stop it.`,
        });
    } catch (error) {
      failures.push(`${job.name} — ${describe(error)}`);
    }
  }
  return { rows, problems, failures };
}
