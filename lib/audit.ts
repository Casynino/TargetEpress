import type { Prisma } from "@prisma/client";

import { prisma, type TxClient } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

type AuditInput = {
  actor: SessionUser | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Append-only record of who did what. Pass a transaction client when the audit
 * entry must live or die with the operation it describes — releasing cargo,
 * issuing a pickup note, recording a payment.
 */
export async function recordAudit(
  input: AuditInput,
  tx?: TxClient
) {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorEmail: input.actor?.email ?? null,
      actorRole: input.actor?.role ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata: input.metadata,
    },
  });
}
