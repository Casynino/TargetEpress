"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { normalisePhone } from "@/lib/format";
import { nextCustomerCode } from "@/lib/ids";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
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

const schema = z.object({
  name: z.string().trim().min(2, "Enter the name or shipping mark.").max(120),
  phone: z
    .string()
    .trim()
    .min(7, "A phone number is required.")
    .max(30)
    .regex(/^[\d+\s()-]+$/, "That does not look like a phone number."),
  city: z.string().trim().max(120).optional(),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .refine(
      (v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      "That email address is not valid."
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
  let user: SessionUser;
  try {
    user = await authorize("customer.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = schema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the customer details.");
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
        _count: { select: { shipments: true } },
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
