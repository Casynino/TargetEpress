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
 * THE NOTE, WHEN SOMEBODY HAD SOMETHING TO SAY.
 *
 * Explaining yourself used to be compulsory before the app would let you
 * cancel, correct or delete anything — and a box that must be filled in is
 * filled in with "ok". The owner's rule now is warn, confirm, do: the note is
 * offered, never demanded.
 *
 * That does not weaken the record. Every one of these lines already carries
 * who, when, which record, and the figures before and after; the note was
 * never the part that answered "what happened". This appends it when there is
 * one and leaves the summary clean when there is not, so no audit line ever
 * ends in a dangling dash.
 */
export function withNote(summary: string, note?: string | null) {
  const said = note?.trim();
  return said ? `${summary} — ${said}` : summary;
}

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
