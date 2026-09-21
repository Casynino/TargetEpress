"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  const MATCH = {
    id: true,
    code: true,
    name: true,
    phone: true,
    city: true,
    _count: { select: { shipments: { where: { deletedAt: null } } } },
  } as const;

  try {
    /*
      BOTH TABLES, BECAUSE A CUSTOMER HAS MORE THAN ONE NUMBER.

      Customer.phone is the main line; CustomerPhone holds the others — the
      second SIM, the son who collects, the office landline. Checking only the
      first meant somebody registering a walk-in by the number already on file
      as a customer's SECOND number got a whole new customer for them, with
      their cargo and their debt split across two records.

      addCustomerPhone has always asked both. This is the same question.
    */
    const alsoKnown = await prisma.customerPhone.findUnique({
      where: { phone },
      select: { customer: { select: MATCH } },
    });
    const existing =
      alsoKnown?.customer ??
      (await prisma.customer.findUnique({ where: { phone }, select: MATCH }));

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
          /* Mirrored, so every lookup has one place to ask — the same write
             resolveCustomer does when a shipment brings in a new customer.
             Without it the number was in Customer.phone alone, the phone list
             on the profile read "no number on file", and setting another
             number as the main one overwrote the only one they had. */
          phones: {
            create: { phone, isPrimary: true, addedById: user.id },
          },
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
 * Held by the desks that meet the duplicate — Support hears "but I already
 * paid for the other one", Finance sees one customer owing two amounts under
 * two codes — because a desk that can only report the problem waits on
 * somebody else to fix what it found. Not the warehouses, who neither see the
 * money nor would know which record is the real one.
 *
 * It cannot be undone from a screen, so the confirmation is the losing record's
 * code, typed; and the audit line names both codes and counts every row that
 * moved.
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
      /* Support's claims name the customer too, and their foreign key is
         Restrict — so a customer with even one claim against them could not be
         merged at all, and the merge failed on the delete with a constraint
         error rather than a sentence. */
      moved.submissions = (
        await tx.paymentSubmission.updateMany({ where, data })
      ).count;

      /*
        THE NUMBERS COME TOO.

        The losing record exists because the customer registered from a second
        SIM. Dropping that number would leave the very consignment that created
        the duplicate unable to find them next time — the merge would have to be
        done again, every time they used that phone. Demoted to secondary: the
        survivor's own number is the one staff already ring.
      */
      moved.phones = (
        await tx.customerPhone.updateMany({
          where: { customerId: merge.id },
          data: { customerId: keep.id, isPrimary: false },
        })
      ).count;

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
        await tx.customerPhone.updateMany({
          where: { customerId: keep.id, phone: adoptPhone },
          data: { isPrimary: true },
        });
      } else if (keep.phone) {
        /* Exactly one primary per customer, and it is the survivor's own. */
        await tx.customerPhone.updateMany({
          where: { customerId: keep.id, phone: { not: keep.phone } },
          data: { isPrimary: false },
        });
        await tx.customerPhone.updateMany({
          where: { customerId: keep.id, phone: keep.phone },
          data: { isPrimary: true },
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

/**
 * ADD A NUMBER TO A CUSTOMER WHO ALREADY EXISTS.
 *
 * "That's her other line." One person, two SIMs, and until the second number
 * was on their account every consignment sent from it created a fresh customer
 * with the same name and half the balance. Recording it here means the next one
 * finds them.
 *
 * The number must belong to nobody else. That is the whole property that makes
 * a phone usable as a key: two owners for one number is two answers to "whose
 * cargo is this", and the desk is told by name and code who has it rather than
 * being left to guess.
 */
export async function addCustomerPhone(input: {
  customerId: string;
  phone: string;
  label?: string;
}): Promise<ActionResult<{ phone: string }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("customer.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const phone = normalisePhone(input.phone.trim());
  if (input.phone.trim().length < 7) {
    return fail(t(locale, "That phone number is too short."));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, name: true, code: true, phone: true },
      });
      if (!customer) throw new Error(t(locale, "That customer no longer exists."));

      const taken = await tx.customerPhone.findUnique({
        where: { phone },
        select: { customerId: true },
      });
      if (taken) {
        if (taken.customerId === customer.id) {
          throw new Error(
            t(locale, "That number is already on this customer.")
          );
        }
        const owner = await tx.customer.findUnique({
          where: { id: taken.customerId },
          select: { name: true, code: true },
        });
        throw new Error(
          `${phone} ${t(locale, "belongs to")} ${owner?.name ?? t(locale, "another customer")} (${owner?.code ?? ""}). ${t(locale, "If they are the same person, merge the two records instead.")}`
        );
      }
      /* The unique column too — a number on one customer's `phone` and another
         customer's list would be two owners by a different route. */
      const primaryOf = await tx.customer.findUnique({
        where: { phone },
        select: { id: true, name: true, code: true },
      });
      if (primaryOf && primaryOf.id !== customer.id) {
        throw new Error(
          `${phone} ${t(locale, "belongs to")} ${primaryOf.name} (${primaryOf.code}). ${t(locale, "If they are the same person, merge the two records instead.")}`
        );
      }

      const first = customer.phone === null;
      await tx.customerPhone.create({
        data: {
          customerId: customer.id,
          phone,
          /* Their first number becomes the one staff ring. A second one does
             not displace it — that is a deliberate change, not a side effect
             of recording another SIM. */
          isPrimary: first,
          label: input.label?.trim() || null,
          addedById: user.id,
        },
      });
      if (first) {
        await tx.customer.update({
          where: { id: customer.id },
          data: { phone },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "customer.update",
          entity: "Customer",
          entityId: customer.id,
          summary: `Added ${phone} to ${customer.name} (${customer.code})`,
          metadata: { phone, primary: first, label: input.label ?? null },
        },
        tx
      );

      return { phone };
    });

    revalidatePath(`/app/customers/${input.customerId}`);
    revalidatePath("/app/customers");
    return ok(result);
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Make one of a customer's numbers the one staff ring, or take a number off.
 *
 * Removing is for a number typed wrong or a SIM the customer has given up. It
 * refuses to take the last one: the phone is how cargo finds its owner, and a
 * customer with none is the hole every duplicate came out of.
 */
export async function updateCustomerPhone(input: {
  customerId: string;
  phone: string;
  action: "primary" | "remove";
}): Promise<ActionResult<undefined>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("customer.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.customerPhone.findUnique({
        where: { phone: input.phone },
        select: { id: true, customerId: true, phone: true },
      });
      if (!row || row.customerId !== input.customerId) {
        throw new Error(t(locale, "That number is not on this customer."));
      }
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { name: true, code: true },
      });

      if (input.action === "primary") {
        await tx.customerPhone.updateMany({
          where: { customerId: input.customerId },
          data: { isPrimary: false },
        });
        await tx.customerPhone.update({
          where: { id: row.id },
          data: { isPrimary: true },
        });
        await tx.customer.update({
          where: { id: input.customerId },
          data: { phone: row.phone },
        });
      } else {
        const count = await tx.customerPhone.count({
          where: { customerId: input.customerId },
        });
        if (count <= 1) {
          throw new Error(
            t(
              locale,
              "A customer must keep at least one number — it is how their cargo finds them."
            )
          );
        }
        await tx.customerPhone.delete({ where: { id: row.id } });
        /* If the one being taken off was the primary, another has to become
           it: the column is what every screen reads. */
        const survivor = await tx.customerPhone.findFirst({
          where: { customerId: input.customerId },
          orderBy: { createdAt: "asc" },
          select: { id: true, phone: true },
        });
        if (survivor) {
          await tx.customerPhone.update({
            where: { id: survivor.id },
            data: { isPrimary: true },
          });
          await tx.customer.update({
            where: { id: input.customerId },
            data: { phone: survivor.phone },
          });
        }
      }

      await recordAudit(
        {
          actor: user,
          action: "customer.update",
          entity: "Customer",
          entityId: input.customerId,
          summary:
            input.action === "primary"
              ? `${row.phone} is now the main number for ${customer?.name ?? "a customer"} (${customer?.code ?? ""})`
              : `Removed ${row.phone} from ${customer?.name ?? "a customer"} (${customer?.code ?? ""})`,
          metadata: { phone: row.phone, action: input.action },
        },
        tx
      );
    });

    revalidatePath(`/app/customers/${input.customerId}`);
    revalidatePath("/app/customers");
    return ok();
  } catch (error) {
    return fail(toActionError(error));
  }
}

const detailsSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().trim().min(2, "Give the customer's name.").max(120, "Keep the name under 120 characters."),
  phone: z.string().trim().max(30).optional(),
  altPhone: z.string().trim().max(30).optional(),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "That email address does not look right."),
  city: z.string().trim().max(80).optional(),
  address: z.string().trim().max(300).optional(),
  reason: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
});

const DETAIL_LABELS: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  altPhone: "Other phone",
  email: "Email",
  city: "City",
  address: "Address",
};

/**
 * CORRECT A CUSTOMER'S DETAILS FROM THEIR OWN PAGE.
 *
 * The page showed the details and let nobody change them there: a wrong name
 * could only be fixed by editing one of the customer's consignments, and a
 * wrong number by adding the right one to a list further down and removing the
 * old. Support, both warehouses, Finance and management correct them here now.
 *
 * THE MAIN NUMBER IS REPLACED, NOT ADDED TO. This form is where a mistyped
 * number is put right, and keeping the wrong one on file would leave it
 * belonging to this customer — so the real owner of that number could never
 * be registered under it. A customer who has genuinely changed number and
 * should keep both is served by the number list below, which adds.
 *
 * Every field that moves is written to the change history with its old value
 * first, as a consignment's are.
 */
export async function updateCustomerDetails(
  _prev: ActionResult<undefined> | undefined,
  formData: FormData
): Promise<ActionResult<undefined>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("customer.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = detailsSchema.safeParse(Object.fromEntries(formData) as Record<string, string>);
  if (!parsed.success) return fail(t(locale, parsed.error.issues[0]?.message ?? "Check the details."));
  const input = parsed.data;
  const orNull = (v: string | undefined) => (v && v.length > 0 ? v : null);

  try {
    const code = await prisma.$transaction(async (tx) => {
      const before = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: {
          id: true,
          code: true,
          name: true,
          phone: true,
          altPhone: true,
          email: true,
          city: true,
          address: true,
        },
      });
      if (!before) throw new Error(t(locale, "That customer no longer exists."));

      const phone = input.phone ? normalisePhone(input.phone) : null;
      if (input.phone && input.phone.replace(/\D/g, "").length < 7) {
        throw new Error(t(locale, "That phone number is too short."));
      }
      const altPhone = input.altPhone ? normalisePhone(input.altPhone) : null;
      /* A customer who has a number keeps one: the phone is how their cargo
         finds them. */
      if (!phone && before.phone) {
        throw new Error(
          t(locale, "A customer must keep at least one number — it is how their cargo finds them.")
        );
      }

      const after = {
        name: input.name,
        phone,
        altPhone,
        email: orNull(input.email),
        city: orNull(input.city),
        address: orNull(input.address),
      };
      const changes = (Object.keys(after) as (keyof typeof after)[])
        .filter((field) => (before[field] ?? null) !== (after[field] ?? null))
        .map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
      if (changes.length === 0) throw new Error(t(locale, "Nothing was changed."));

      if (phone && phone !== before.phone) {
        /* A number is an identity: it may not already be somebody else's. */
        const listed = await tx.customerPhone.findUnique({
          where: { phone },
          select: { customerId: true },
        });
        const holder = await tx.customer.findUnique({
          where: { phone },
          select: { id: true, name: true, code: true },
        });
        const otherId =
          listed && listed.customerId !== before.id
            ? listed.customerId
            : holder && holder.id !== before.id
              ? holder.id
              : null;
        if (otherId) {
          const other = await tx.customer.findUnique({
            where: { id: otherId },
            select: { name: true, code: true },
          });
          throw new Error(
            `${phone} ${t(locale, "belongs to")} ${other?.name ?? t(locale, "another customer")} (${other?.code ?? ""}). ${t(locale, "If they are the same person, merge the two records instead.")}`
          );
        }

        await tx.customerPhone.updateMany({
          where: { customerId: before.id },
          data: { isPrimary: false },
        });
        if (listed) {
          await tx.customerPhone.updateMany({
            where: { customerId: before.id, phone },
            data: { isPrimary: true },
          });
        } else {
          await tx.customerPhone.create({
            data: { customerId: before.id, phone, isPrimary: true, addedById: user.id },
          });
        }
        /* The corrected number replaces the one it corrects. */
        if (before.phone) {
          await tx.customerPhone.deleteMany({
            where: { customerId: before.id, phone: before.phone },
          });
        }
      }

      await tx.customer.update({
        where: { id: before.id },
        data: after,
      });

      await tx.fieldChange.createMany({
        data: changes.map((change) => ({
          entity: "Customer",
          entityId: before.id,
          field: change.field,
          before: change.before,
          after: change.after,
          actorId: user.id,
          actorName: user.name,
          reason: orNull(input.reason),
        })),
      });

      await recordAudit(
        {
          actor: user,
          action: "customer.update",
          entity: "Customer",
          entityId: before.id,
          summary: `Corrected ${before.name} (${before.code}) — ${changes
            .map((c) => DETAIL_LABELS[c.field] ?? c.field)
            .join(", ")}`,
          metadata: {
            changes: changes.map(
              (c) => `${DETAIL_LABELS[c.field] ?? c.field}: ${c.before ?? "—"} → ${c.after ?? "—"}`
            ),
            reason: orNull(input.reason),
          },
        },
        tx
      );
      return before.code;
    });

    revalidatePath(`/app/customers/${code}`);
    revalidatePath(`/app/customers/${input.customerId}`);
    revalidatePath("/app/customers");
    return ok(undefined);
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * DELETE A CUSTOMER THAT NOTHING HANGS OFF.
 *
 * A duplicate typed at the counter, a name registered for a shipment that never
 * came — records with no history. Anything with history is refused, by whoever
 * asks: cargo, a bill, a payment, a pickup note, a payment claim, a support
 * ticket, a sourcing request or a message on record. Deleting those would take
 * money and a paper trail with it, or leave them belonging to nobody; a
 * duplicate with history is merged into the right customer instead.
 *
 * What was deleted is kept in the audit log — name, code, numbers, email,
 * city, address — so a deletion can always be explained.
 */
export async function deleteCustomer(
  _prev: ActionResult<undefined> | undefined,
  formData: FormData
): Promise<ActionResult<undefined>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("customer.delete");
  } catch (error) {
    return fail(toActionError(error));
  }
  const customerId = String(formData.get("customerId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!customerId) return fail(t(locale, "That customer no longer exists."));

  try {
    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          code: true,
          name: true,
          phone: true,
          altPhone: true,
          email: true,
          city: true,
          address: true,
          phones: { select: { phone: true } },
          _count: {
            select: {
              shipments: true,
              invoices: true,
              payments: true,
              pickupNotes: true,
              submissions: true,
              tickets: true,
              requests: true,
              messages: true,
              packageCombinations: true,
            },
          },
        },
      });
      if (!customer) throw new Error(t(locale, "That customer no longer exists."));

      const c = customer._count;
      const held = [
        c.shipments ? `${c.shipments} ${t(locale, c.shipments === 1 ? "consignment" : "consignments")}` : null,
        c.invoices ? `${c.invoices} ${t(locale, c.invoices === 1 ? "bill" : "bills")}` : null,
        c.payments ? `${c.payments} ${t(locale, c.payments === 1 ? "payment" : "payments")}` : null,
        c.pickupNotes ? `${c.pickupNotes} ${t(locale, "pickup note(s)")}` : null,
        c.submissions ? `${c.submissions} ${t(locale, "payment claim(s)")}` : null,
        c.tickets ? `${c.tickets} ${t(locale, "support ticket(s)")}` : null,
        c.requests ? `${c.requests} ${t(locale, "sourcing request(s)")}` : null,
        c.messages ? `${c.messages} ${t(locale, "message(s) on record")}` : null,
        c.packageCombinations ? `${c.packageCombinations} ${t(locale, "combined package(s)")}` : null,
      ].filter(Boolean);
      if (held.length > 0) {
        throw new Error(
          `${customer.name} (${customer.code}) ${t(locale, "has")} ${held.join(", ")}, ${t(locale, "so the record cannot be deleted — that history must keep its owner. If this is a duplicate, merge it into the right customer instead (Support or Finance can).")}`
        );
      }

      await tx.customer.delete({ where: { id: customer.id } });

      await recordAudit(
        {
          actor: user,
          action: "customer.delete",
          entity: "Customer",
          entityId: customer.id,
          summary: `Deleted ${customer.name} (${customer.code})${reason ? ` — ${reason}` : ""}`,
          metadata: {
            code: customer.code,
            name: customer.name,
            phone: customer.phone,
            phones: customer.phones.map((p) => p.phone),
            altPhone: customer.altPhone,
            email: customer.email,
            city: customer.city,
            address: customer.address,
            reason: reason || null,
          },
        },
        tx
      );
    });

  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
  /* Straight to the list. The page the button was on is the record that no
     longer exists, and left to refresh itself it answered "not found". Outside
     the try: a redirect is thrown, and the catch above would swallow it. */
  revalidatePath("/app/customers");
  redirect("/app/customers");
}
