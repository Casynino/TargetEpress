import "server-only";

import { describe } from "@/lib/developer/safe";
import { prisma } from "@/lib/prisma";

/**
 * A NIGHTLY JOB LEAVES A LINE SAYING IT RAN.
 *
 * "Is the schedule working?" used to be answered by inference — has any storage
 * been charged lately? — which is silent when there was simply nothing to
 * charge. A run now writes its own line, so the Developer Home can say
 * "last ran 06:05, took 1.2 s, charged 3" or "has not run for two days".
 *
 * Written to the audit log under action `job.run`, entity id = the job's key.
 * No actor: nobody did it, the scheduler did. It never throws — a job must not
 * fail because its own diary could not be written.
 */
export async function recordJobRun(input: {
  key: string;
  name: string;
  ok: boolean;
  ms: number;
  detail?: Record<string, unknown>;
  error?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: "job.run",
        entity: "Job",
        entityId: input.key,
        summary: input.ok
          ? `${input.name} ran`
          : `${input.name} failed: ${describe(input.error)}`,
        metadata: {
          job: input.key,
          outcome: input.ok ? "success" : "failure",
          ms: Math.round(input.ms),
          ...(input.detail ?? {}),
        },
      },
    });
  } catch {
    /* The run itself succeeded or failed on its own merits; losing the diary
       line must not change that. */
  }
}
