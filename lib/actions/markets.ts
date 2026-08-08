"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * The China markets directory.
 *
 * Guarded by pricing.manage — the same authority as the rate book, because this
 * is the other thing on the public site that tells a customer what to expect.
 * A market's route decides what their goods cost to fly home, so getting it
 * wrong here misquotes them just as surely as a wrong price does.
 */

/** Turns one-per-line textarea input into a clean ordered list. */
const lines = z
  .string()
  .trim()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 30)
  );

const schema = z.object({
  id: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  name: z.string().trim().min(2, "Give the market a name.").max(120),
  nameCn: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2, "Which city?").max(120),
  district: z.string().trim().max(120).optional(),
  route: z.enum(["GUANGZHOU", "HONG_KONG"]),
  hours: z.string().trim().max(200).optional(),
  bestFor: z.string().trim().min(4, "One line: who should go here.").max(200),
  summary: z.string().trim().min(10, "Describe the market.").max(1200),
  products: lines,
  tips: lines,
  verify: z.string().trim().max(400).optional(),
  sortOrder: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : 0))
    .refine((v) => Number.isFinite(v), "Order must be a number."),
});

/** URL-safe slug from the market's name. Stable once set, so links keep working. */
function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export async function saveMarket(
  _prev: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  let user: SessionUser;
  try {
    user = await authorize("settings.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = schema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the market details.");
  }
  const input = parsed.data;

  try {
    const data = {
      name: input.name,
      nameCn: input.nameCn || null,
      city: input.city,
      district: input.district || null,
      route: input.route,
      hours: input.hours || null,
      bestFor: input.bestFor,
      summary: input.summary,
      products: input.products,
      tips: input.tips,
      verify: input.verify || null,
      sortOrder: input.sortOrder,
    };

    const market = input.id
      ? await prisma.chinaMarket.update({
          where: { id: input.id },
          data,
          select: { id: true, name: true },
        })
      : await prisma.chinaMarket.create({
          // The slug is only minted on create. Changing a market's name later
          // must not break a link someone has already shared.
          data: { ...data, slug: await uniqueSlug(slugify(input.name)) },
          select: { id: true, name: true },
        });

    await recordAudit({
      actor: user,
      action: input.id ? "market.update" : "market.create",
      entity: "ChinaMarket",
      entityId: market.id,
      summary: `${input.id ? "Updated" : "Added"} market "${market.name}"`,
    });

    revalidatePath("/app/admin/markets");
    revalidatePath("/app/support/markets");
    revalidatePath("/china/markets");
    return ok({ id: market.id });
  } catch (error) {
    return fail(toActionError(error));
  }
}

async function uniqueSlug(base: string) {
  let candidate = base || "market";
  let suffix = 2;
  // Loop rather than trusting the first attempt: two markets in the same city
  // can genuinely share a name.
  while (await prisma.chinaMarket.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}

export async function setMarketActive(
  marketId: string,
  active: boolean
): Promise<ActionResult<{ active: boolean }>> {
  let user: SessionUser;
  try {
    user = await authorize("settings.manage");
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    const market = await prisma.chinaMarket.update({
      where: { id: marketId },
      data: { active },
      select: { name: true },
    });

    await recordAudit({
      actor: user,
      action: active ? "market.publish" : "market.hide",
      entity: "ChinaMarket",
      entityId: marketId,
      summary: `${active ? "Published" : "Hid"} market "${market.name}"`,
    });

    revalidatePath("/app/admin/markets");
    revalidatePath("/app/support/markets");
    revalidatePath("/china/markets");
    return ok({ active });
  } catch (error) {
    return fail(toActionError(error));
  }
}
