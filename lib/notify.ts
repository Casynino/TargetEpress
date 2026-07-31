import "server-only";

import { prisma, type TxClient } from "@/lib/prisma";

/**
 * Telling people things.
 *
 * Notifications are written where the event happens, in the same transaction,
 * so a batch that was dispatched and a notification saying so cannot disagree.
 * They are deliberately thin — a line of text and somewhere to go — because
 * they are read on a phone in a warehouse, once.
 *
 * Nothing here fans out to everybody. A notification with no clear reader is
 * an announcement, and announcements are addressed explicitly.
 */

type NotifyInput = {
  userIds: string[];
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
};

export async function notify(input: NotifyInput, tx?: TxClient) {
  const recipients = [...new Set(input.userIds)].filter(Boolean);
  if (recipients.length === 0) return;

  const client = tx ?? prisma;
  await client.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    })),
  });
}

/**
 * Everyone who put cargo on a batch.
 *
 * The people to tell about a dispatch are the ones whose work is on the plane,
 * which is not the same as everyone in the department.
 */
export async function contributorsTo(
  batchId: string,
  tx?: TxClient
): Promise<string[]> {
  const client = tx ?? prisma;
  const rows = await client.shipment.findMany({
    where: { batchId, createdById: { not: null } },
    select: { createdById: true },
    distinct: ["createdById"],
  });
  return rows
    .map((row) => row.createdById)
    .filter((id): id is string => id !== null);
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
