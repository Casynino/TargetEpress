import "server-only";

import type { Role } from "@prisma/client";

import { prisma, type TxClient } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { can, ROLE_PERMISSIONS, type Permission } from "@/lib/rbac";
import type { ReceivingOutcome } from "@/lib/receiving-outcomes";

/**
 * Who needs to know a case was opened.
 *
 * Addressed by permission, never by role. "Tell Customer Support" is really
 * "tell whoever answers customers", and the day a fifth department is added
 * this keeps working without anybody remembering to come back here.
 *
 * Nothing fans out to everybody: an announcement with no obvious reader is
 * noise, and noise is what makes a warehouse stop reading its notifications.
 */

/** Every active account whose role holds at least one of these permissions. */
export async function desksHolding(
  permissions: Permission[],
  tx?: TxClient
): Promise<string[]> {
  if (permissions.length === 0) return [];

  const roles = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((role) =>
    permissions.some((permission) => can(role, permission))
  );
  if (roles.length === 0) return [];

  const client = tx ?? prisma;
  const users = await client.user.findMany({
    where: { role: { in: roles }, active: true, status: "ACTIVE" },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/**
 * The desks each check-in outcome has to reach, from the owner's spec.
 *
 * `ticket.manage` is the customer-facing desk: it is the phone that rings when
 * tracking says something a customer did not expect, so it is on every one of
 * these. `user.manage` is the CEO. `exception.compensate` is Finance, told
 * about damage the moment it lands rather than when a claim arrives — the
 * amount is argued later, but the photographs are only takeable now.
 */
const OUTCOME_AUDIENCE: Record<ReceivingOutcome, Permission[]> = {
  RECEIVED: [],
  MISSING: ["ticket.manage", "user.manage"],
  DAMAGED: ["ticket.manage", "exception.compensate"],
  WRONG_ITEM: ["ticket.manage", "user.manage"],
  WRONG_QUANTITY: ["ticket.manage", "user.manage"],
  HOLD: ["ticket.manage", "user.manage"],
};

/**
 * Tell the right desks that arrival check-in opened a case.
 *
 * Written inside the caller's transaction, so a case that exists and a
 * notification saying so cannot disagree. The person who raised it is left out
 * — they were standing in front of the cargo.
 */
export async function notifyReceivingOutcome(
  input: {
    outcome: ReceivingOutcome;
    trackingNumber: string;
    headline: string;
    detail: string;
    raisedById: string;
  },
  tx?: TxClient
) {
  const audience = OUTCOME_AUDIENCE[input.outcome];
  if (audience.length === 0) return;

  const userIds = (await desksHolding(audience, tx)).filter(
    (id) => id !== input.raisedById
  );

  await notify(
    {
      userIds,
      kind: `exception.${input.outcome.toLowerCase()}`,
      title: input.headline,
      body: input.detail,
      href: `/app/exceptions?tracking=${input.trackingNumber}`,
    },
    tx
  );
}
