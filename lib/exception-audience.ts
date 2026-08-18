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
 * these. `exception.approve` is whoever rules on cases. `exception.compensate`
 * is Finance, told about damage the moment it lands rather than when a claim
 * arrives — the amount is argued later, but the photographs are only takeable
 * now.
 *
 * THE BOSS ROW SAID `user.manage`, WHICH WAS THE WRONG WORD FOR THE RIGHT SET.
 *
 * Not a bug — checked, and the audience is byte-for-byte identical before and
 * after this change, because these lists are OR'd and the manager already
 * qualified through `ticket.manage`. What was wrong was the reasoning:
 * `user.manage` is the permission to administer staff accounts, and it was
 * standing in for "the person who answers for the company". Those were the same
 * human while the CEO was the only one, and the file above promises this keeps
 * working when a role is added — a promise it cannot keep while an audience is
 * named after an unrelated capability that merely correlates with seniority.
 *
 * `exception.approve` is what these notifications actually ask of their reader:
 * somebody who can rule on the case. Same people today, and still the right
 * people the day the owner decides a manager should not rule on cases, or that
 * somebody else should.
 */
const OUTCOME_AUDIENCE: Record<ReceivingOutcome, Permission[]> = {
  RECEIVED: [],
  MISSING: ["ticket.manage", "exception.approve"],
  DAMAGED: ["ticket.manage", "exception.compensate"],
  WRONG_ITEM: ["ticket.manage", "exception.approve"],
  WRONG_QUANTITY: ["ticket.manage", "exception.approve"],
  HOLD: ["ticket.manage", "exception.approve"],
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
