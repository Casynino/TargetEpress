import type { Prisma, Role } from "@prisma/client";

import { DEVELOPER, developerMetadata } from "@/lib/developer-shared";
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
  /*
    A SESSION LOOKING AS SOMEBODY ELSE IS STILL THE DEVELOPER.

    Work-as is view-only and authorize() refuses every action while it is on,
    so nothing should reach here carrying the borrowed identity. If something
    ever does — a page that records a view, a path nobody thought of — the line
    must name the person who was really there, never the one they were looking
    as. The borrowed identity goes in the metadata, as a fact about the act.
  */
  const real = input.actor?.impersonatedBy ?? null;
  const author = real
    ? { id: real.id, email: real.email, role: DEVELOPER as Role }
    : input.actor
      ? { id: input.actor.id, email: input.actor.email, role: input.actor.role }
      : null;
  /*
    EVERY LINE THE DEVELOPER WRITES SAYS SO, WHATEVER WROTE IT.

    Two hundred call sites record audit lines and none of them knows there is a
    Developer account. So the stamp is applied here, once, on the one thing all
    of them share — who the actor is. A developer's act carries developer:true,
    an outcome and the zone it is read in, merged UNDER whatever the action
    already put in metadata, never replacing it. Any other actor's line is
    stored exactly as it always was.
  */
  const metadata =
    author?.role === DEVELOPER
      ? (developerMetadata(
          real
            ? {
                ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
                  ? input.metadata
                  : {}),
                workingAs: { id: input.actor!.id, name: input.actor!.name },
              }
            : input.metadata
        ) as unknown as Prisma.InputJsonValue)
      : input.metadata;
  const row = await client.auditLog.create({
    select: { id: true },
    data: {
      actorId: author?.id ?? null,
      actorEmail: author?.email ?? null,
      actorRole: author?.role ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata,
    },
  });
  return row.id;
}
