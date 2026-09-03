"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { normalisePhone } from "@/lib/format";
import { t } from "@/lib/i18n";
import { nextCustomerCode } from "@/lib/ids";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

export type SavedCustomer = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  city: string | null;
  shipments: number;
  /** True when the number already belonged to somebody on the books. */
  existing: boolean;
};

/**
 * Built per request rather than once at module load: the messages are read by
 * whoever submitted the form, and a schema frozen at import time could only
 * ever speak one language.
 */
const schemaFor = (locale: Locale) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(2, t(locale, "Enter the name or shipping mark."))
      .max(120),
    phone: z
      .string()
      .trim()
      .min(7, t(locale, "A phone number is required."))
      .max(30)
      .regex(
        /^[\d+\s()-]+$/,
        t(locale, "That does not look like a phone number.")
      ),
    city: z.string().trim().max(120).optional(),
    email: z
      .string()
      .trim()
      .max(160)
      .optional()
      .refine(
        (v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
        t(locale, "That email address is not valid.")
      ),
  });

/**
 * Adds a customer to the book.
 *
 * Saved on its own, before any cargo exists — so the desk can register someone
 * who has walked in, or set up a trader they know is sending next week.
 *
 * The phone number is the identity. If it already belongs to someone, this
 * returns that customer rather than creating a second record: two rows sharing a
 * number is how one person's cargo ends up under another person's name. The
 * caller is told it was an existing match, so the screen can say so plainly
 * instead of pretending it created something.
 */
export async function createCustomer(
  _prev: ActionResult<SavedCustomer> | undefined,
  formData: FormData
): Promise<ActionResult<SavedCustomer>> {
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await authorize("customer.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = schemaFor(locale).safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? t(locale, "Check the customer details.")
    );
  }
  const input = parsed.data;
  const phone = normalisePhone(input.phone);

  try {
    const existing = await prisma.customer.findUnique({
      where: { phone },
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        city: true,
        _count: { select: { shipments: { where: { deletedAt: null } } } },
      },
    });

    if (existing) {
      return ok({
        id: existing.id,
        code: existing.code,
        name: existing.name,
        phone: existing.phone,
        city: existing.city,
        shipments: existing._count.shipments,
        existing: true,
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          code: await nextCustomerCode(tx),
          name: input.name,
          phone,
          city: input.city || null,
          email: input.email || null,
          createdById: user.id,
        },
        select: { id: true, code: true, name: true, phone: true, city: true },
      });

      await recordAudit(
        {
          actor: user,
          action: "customer.create",
          entity: "Customer",
          entityId: customer.id,
          summary: `Added customer ${customer.code} — ${customer.name}`,
        },
        tx
      );

      return customer;
    });

    revalidatePath("/app/customers");
    return ok({ ...created, shipments: 0, existing: false });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Fold one customer record into another.
 *
 * The system matches customers on phone number, and cargo can legitimately be
 * registered without one — a Guangzhou packing list arrives with a shipping
 * mark and nothing else. So the same person acquires a second record, and from
 * then on their money is split across two accounts: two balances, two credit
 * histories, and a payment screen that shows one open bill where there are
 * three. Nothing is wrong with either record; they are simply both half of
 * somebody.
 *
 * Merging repoints everything the losing record holds — cargo, invoices,
 * payments, pickup notes, tickets, sourcing requests, message history — onto
 * the surviving one and then removes the empty shell. No figure changes: the
 * balance the customer now shows is the sum of the two they showed before,
 * because every balance in this system is derived from the rows that moved.
 *
 * It cannot be undone from a screen, which is why it sits behind its own
 * permission rather than customer.manage, and why the audit line names both
 * codes and counts every row that moved.
 */
export async function mergeCustomers(input: {
  keepId: string;
  mergeId: string;
}): Promise<ActionResult<{ moved: number }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("customer.merge");
  } catch (error) {
    return fail(toActionError(error));
  }

  if (input.keepId === input.mergeId) {
    return fail(t(locale, "Pick two different customers."));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [keep, merge] = await Promise.all([
        tx.customer.findUnique({ where: { id: input.keepId } }),
        tx.customer.findUnique({ where: { id: input.mergeId } }),
      ]);
      if (!keep || !merge) {
        throw new Error(t(locale, "That customer no longer exists."));
      }

      /*
        A credit facility is a decision somebody signed their name to, for a
        named account. Carrying it across silently would grant the survivor a
        limit nobody approved for them, so the merge stops and asks for the
        facility to be closed deliberately first.
      */
      if (merge.creditLimitUsd !== null) {
        throw new Error(
          t(
            locale,
            "That record has a credit limit. Remove the credit facility first, then merge."
          )
        );
      }

      const moved: Record<string, number> = {};
      const where = { customerId: merge.id };
      const data = { customerId: keep.id };

      moved.shipments = (await tx.shipment.updateMany({ where, data })).count;
      moved.invoices = (await tx.invoice.updateMany({ where, data })).count;
      moved.payments = (await tx.payment.updateMany({ where, data })).count;
      moved.pickupNotes = (await tx.pickupNote.updateMany({ where, data }))
        .count;
      moved.tickets = (await tx.supportTicket.updateMany({ where, data }))
        .count;
      moved.requests = (await tx.sourcingRequest.updateMany({ where, data }))
        .count;
      moved.messages = (await tx.customerMessage.updateMany({ where, data }))
        .count;

      /*
        The phone is the matching key, and the record being removed is often the
        one that has it — the duplicate was created precisely because somebody
        typed the number the first record never had. Adopt it, but never
        overwrite a number the survivor already carries: that one is the number
        staff have been ringing.
      */
      const adoptPhone = !keep.phone && merge.phone ? merge.phone : null;
      if (adoptPhone) {
        /* Freed first — the column is unique, and both rows still exist. */
        await tx.customer.update({
          where: { id: merge.id },
          data: { phone: null },
        });
        await tx.customer.update({
          where: { id: keep.id },
          data: { phone: adoptPhone },
        });
      }

      await tx.customer.delete({ where: { id: merge.id } });

      const total = Object.values(moved).reduce((sum, n) => sum + n, 0);
      await recordAudit(
        {
          actor: user,
          action: "customer.merge",
          entity: "Customer",
          entityId: keep.id,
          summary: `Merged ${merge.code} (${merge.name}) into ${keep.code} (${keep.name}) — ${total} record(s) moved`,
          metadata: {
            keptCode: keep.code,
            removedCode: merge.code,
            removedName: merge.name,
            removedPhone: merge.phone,
            adoptedPhone: Boolean(adoptPhone),
            moved,
          },
        },
        tx
      );

      return { moved: total };
    });

    revalidatePath("/app/customers");
    revalidatePath(`/app/customers/${input.keepId}`);
    revalidatePath("/app/finance/payments/new");
    return ok(result);
  } catch (error) {
    return fail(toActionError(error));
  }
}
