"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { defaultSettings } from "@/lib/company-settings";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Changing what customers are told.
 *
 * Every field here appears on an invoice, a PDF, a WhatsApp message and the
 * public tracking page at once, so this is the most consequential form in the
 * app for its size: a mistyped Lipa number sends every customer's money to
 * nobody until somebody notices.
 *
 * Which is why it does two things beyond saving. It refuses a blank account
 * list rather than writing one — a settings row that empties the accounts is
 * an invoice with nowhere to pay. And every change is audited with what it was
 * before, because "the number changed and nobody knows when" is the question
 * this table will eventually be asked.
 *
 * Existing invoices are untouched by design: each one carries the accounts it
 * was issued with. See Invoice.paymentSnapshot.
 */

const accountSchema = z.object({
  label: z.string().trim().min(3, "Every account needs a label a customer can read."),
  number: z.string().trim().min(3, "An account needs a number."),
  accountName: z.string().trim().min(2, "An account needs the name it is held in."),
  kind: z.enum(["MOBILE", "BANK"]),
  currency: z.enum(["TZS", "USD"]).optional(),
});

const officeSchema = z.object({
  city: z.string().trim().min(2),
  country: z.string().trim().min(2),
  flag: z.string().trim().min(1),
  lines: z.array(z.string().trim().min(1)).min(1, "An address needs at least one line."),
});

const settingsSchema = z.object({
  accounts: z.array(accountSchema).min(1, "Keep at least one account — an invoice with nowhere to pay is worse than none."),
  contact: z.object({
    phone: z.string().trim().min(6),
    phoneAlt: z.string().trim(),
    whatsapp: z.string().trim().min(6),
    email: z.string().trim().email("That is not an email address."),
  }),
  dar: officeSchema,
  china: officeSchema,
});

export async function saveCompanySettings(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  let user: SessionUser;
  try {
    // The CEO's own settings. Finance reads them; only the owner changes them.
    user = await authorize("settings.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  let parsed;
  try {
    parsed = settingsSchema.safeParse(JSON.parse(String(formData.get("payload") ?? "{}")));
  } catch {
    return fail("That did not arrive as valid settings. Nothing was changed.");
  }
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Those settings are not valid.");
  }
  const input = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.companySetting.findMany({
        select: { key: true, value: true },
      });

      for (const [key, value] of Object.entries(input)) {
        await tx.companySetting.upsert({
          where: { key },
          create: {
            key,
            value: value as Prisma.InputJsonValue,
            updatedById: user.id,
          },
          update: {
            value: value as Prisma.InputJsonValue,
            updatedById: user.id,
          },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "settings.update",
          entity: "CompanySetting",
          summary: `Company settings changed — ${input.accounts.length} collection account(s), ${input.contact.phone}`,
          // What it was, so a wrong number can be traced to the day it changed.
          metadata: {
            before: before as unknown as Prisma.InputJsonValue,
            department: user.role,
          },
        },
        tx
      );
    });

    // Everything customer-facing reads these.
    for (const path of ["/", "/contact", "/track", "/app/admin/settings"]) {
      revalidatePath(path);
    }
    return { ok: true };
  } catch (error) {
    return fail(toActionError(error));
  }
}

/** Put the code's own values back, when an edit has gone wrong. */
export async function resetCompanySettings(): Promise<ActionResult> {
  let user: SessionUser;
  try {
    user = await authorize("settings.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.companySetting.deleteMany({});
      await recordAudit(
        {
          actor: user,
          action: "settings.reset",
          entity: "CompanySetting",
          summary: "Company settings reset to the values the app ships with",
          metadata: { department: user.role },
        },
        tx
      );
    });
    revalidatePath("/app/admin/settings");
    return { ok: true };
  } catch (error) {
    return fail(toActionError(error));
  }
}

export { defaultSettings };
