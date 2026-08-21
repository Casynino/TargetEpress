"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { BASE_CURRENCY, LOCAL_CURRENCY, currentRateValue } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

const schema = z.object({
  rate: z
    .string()
    .trim()
    .min(1, "Enter the new rate.")
    .refine((v) => !Number.isNaN(Number(v)), "The rate must be a number.")
    .transform(Number)
    .refine((v) => v > 0, "The rate must be greater than zero.")
    // A fat-fingered 27000 instead of 2700 would multiply every invoice tenfold.
    .refine(
      (v) => v >= 100 && v <= 100_000,
      "That rate looks wrong for USD→TZS. Check the number of digits."
    ),
  notes: z.string().trim().optional(),
});

/**
 * Publishes a new USD→TZS rate.
 *
 * Inserts a row rather than editing one: the old rate has to stay readable
 * because invoices raised under it reference it. Guarded to Finance and above.
 */
export async function setExchangeRate(
  _prev: ActionResult<{ rate: number }> | undefined,
  formData: FormData
): Promise<ActionResult<{ rate: number }>> {
  const locale = await viewerLocale();
  let user: SessionUser;
  try {
    user = await authorize("fx.manage");
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }

  const parsed = schema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    // The schema's messages are written in English and translated here, at the
    // one point where they stop being a validation rule and become something a
    // person reads.
    return fail(
      t(locale, parsed.error.issues[0]?.message ?? "Check the rate.")
    );
  }

  const previous = await currentRateValue();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.exchangeRate.create({
        data: {
          fromCurrency: BASE_CURRENCY,
          toCurrency: LOCAL_CURRENCY,
          rate: new Prisma.Decimal(parsed.data.rate),
          notes: parsed.data.notes || null,
          setById: user.id,
        },
      });

      await recordAudit(
        {
          actor: user,
          action: "fx.setRate",
          entity: "ExchangeRate",
          summary:
            previous === null
              ? `Published the first USD→TZS rate: ${parsed.data.rate.toLocaleString()}`
              : `Changed USD→TZS from ${previous.toLocaleString()} to ${parsed.data.rate.toLocaleString()}`,
          metadata: { previous, next: parsed.data.rate },
        },
        tx
      );
    });

    // Invoices already raised keep their own rate, so only forward-looking
    // screens need refreshing.
    revalidatePath("/app/finance");
    revalidatePath("/app/finance/exchange-rate");
    revalidatePath("/app/admin/pricing");
    return ok({ rate: parsed.data.rate });
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
