"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * The rate book, managed by the CEO.
 *
 * Two deliberate choices run through this file:
 *
 *  1. A price is never edited. Changing a rate deactivates the old rule and
 *     inserts a new one, so an invoice raised last month can still be explained
 *     by the rule that produced it.
 *  2. A product is never deleted, only archived. Shipments point at products,
 *     and a shipment must keep saying what it contained.
 */

const CATEGORY = z.enum(["NORMAL_GOODS", "ELECTRONICS", "LIQUID_SPECIAL"]);
const METHOD = z.enum(["WEIGHT_BASED", "FIXED_PER_ITEM"]);
const ROUTE = z.enum(["GUANGZHOU", "HONG_KONG"]);

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? Number(v) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "That number is not valid.");

const productSchema = z.object({
  name: z.string().trim().min(2, "Give the product a name."),
  category: CATEGORY,
  route: ROUTE,
  keywords: z.string().trim().optional(),
});

const ruleSchema = z
  .object({
    category: CATEGORY,
    cargoTypeId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    method: METHOD,
    price: z
      .string()
      .trim()
      .min(1, "Enter the price.")
      .refine((v) => !Number.isNaN(Number(v)), "The price must be a number.")
      .transform(Number)
      .refine((v) => v > 0, "The price must be greater than zero."),
    minWeightKg: optionalNumber,
    maxWeightKg: optionalNumber,
    minChargeableKg: optionalNumber,
    minCharge: optionalNumber,
    notes: z.string().trim().optional(),
  })
  .refine(
    (v) =>
      v.minWeightKg === null ||
      v.maxWeightKg === null ||
      v.maxWeightKg > v.minWeightKg,
    { message: "The tier's upper bound must be above its lower bound.", path: ["maxWeightKg"] }
  )
  .refine((v) => v.method === "WEIGHT_BASED" || v.cargoTypeId !== null, {
    message: "A fixed per-item price has to name the product it applies to.",
    path: ["cargoTypeId"],
  });

async function actor(): Promise<SessionUser> {
  return authorize("pricing.manage");
}

/** Adds a product to the catalogue customers and clerks pick from. */
export async function createProduct(
  _prev: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  let user: SessionUser;
  try {
    user = await actor();
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = productSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the product details.");
  }
  const input = parsed.data;

  try {
    // A name is unique within its category, so "Batteries" can exist as both
    // normal goods and special goods if the business ever splits them.
    const clash = await prisma.cargoType.findUnique({
      where: { category_name: { category: input.category, name: input.name } },
      select: { id: true, active: true },
    });

    if (clash) {
      if (clash.active) {
        return fail(`"${input.name}" already exists in that category.`);
      }
      // Reviving an archived product keeps its history rather than making a twin.
      await prisma.cargoType.update({
        where: { id: clash.id },
        data: { active: true, route: input.route },
      });
      revalidatePath("/app/admin/pricing");
      return ok({ id: clash.id });
    }

    const last = await prisma.cargoType.findFirst({
      where: { category: input.category },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.cargoType.create({
        data: {
          name: input.name,
          category: input.category,
          route: input.route,
          keywords: input.keywords || null,
          sortOrder: (last?.sortOrder ?? 0) + 1,
        },
        select: { id: true },
      });

      await recordAudit(
        {
          actor: user,
          action: "pricing.createProduct",
          entity: "CargoType",
          entityId: product.id,
          summary: `Added product "${input.name}" (${input.category})`,
          metadata: { ...input },
        },
        tx
      );

      return product;
    });

    revalidatePath("/app/admin/pricing");
    revalidatePath("/app/shipments/new");
    revalidatePath("/calculator");
    return ok({ id: created.id });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/** Archives or restores a product. Never deletes: shipments reference it. */
export async function setProductActive(
  productId: string,
  active: boolean
): Promise<ActionResult<{ active: boolean }>> {
  let user: SessionUser;
  try {
    user = await actor();
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    const product = await prisma.cargoType.findUnique({
      where: { id: productId },
      select: { name: true, category: true },
    });
    if (!product) return fail("That product no longer exists.");

    await prisma.$transaction(async (tx) => {
      await tx.cargoType.update({ where: { id: productId }, data: { active } });

      // Its rules go quiet with it, or nothing changes: a live rule on an
      // archived product would still price cargo nobody can select.
      if (!active) {
        await tx.pricingRule.updateMany({
          where: { cargoTypeId: productId, active: true },
          data: { active: false },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: active ? "pricing.restoreProduct" : "pricing.archiveProduct",
          entity: "CargoType",
          entityId: productId,
          summary: `${active ? "Restored" : "Archived"} product "${product.name}"`,
        },
        tx
      );
    });

    revalidatePath("/app/admin/pricing");
    revalidatePath("/app/shipments/new");
    revalidatePath("/calculator");
    return ok({ active });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/**
 * Publishes a price.
 *
 * Supersedes any live rule covering the same ground rather than sitting
 * alongside it — two active rules for the same product and tier would make the
 * quote depend on row order, which is how a business ends up billing two
 * customers differently for the same cargo.
 */
export async function publishRule(
  _prev: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  let user: SessionUser;
  try {
    user = await actor();
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = ruleSchema.safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the price details.");
  }
  const input = parsed.data;

  try {
    if (input.cargoTypeId) {
      const product = await prisma.cargoType.findUnique({
        where: { id: input.cargoTypeId },
        select: { category: true, active: true },
      });
      if (!product) return fail("That product no longer exists.");
      if (!product.active) return fail("That product is archived. Restore it first.");
      if (product.category !== input.category) {
        return fail("The product belongs to a different cargo category.");
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const superseded = await tx.pricingRule.updateMany({
        where: {
          active: true,
          category: input.category,
          cargoTypeId: input.cargoTypeId,
          method: input.method,
          minWeightKg: input.minWeightKg,
          maxWeightKg: input.maxWeightKg,
        },
        data: { active: false },
      });

      const rule = await tx.pricingRule.create({
        data: {
          category: input.category,
          cargoTypeId: input.cargoTypeId,
          method: input.method,
          price: new Prisma.Decimal(input.price),
          currency: "USD",
          minWeightKg:
            input.minWeightKg === null ? null : new Prisma.Decimal(input.minWeightKg),
          maxWeightKg:
            input.maxWeightKg === null ? null : new Prisma.Decimal(input.maxWeightKg),
          minChargeableKg:
            input.minChargeableKg === null
              ? null
              : new Prisma.Decimal(input.minChargeableKg),
          minCharge:
            input.minCharge === null ? null : new Prisma.Decimal(input.minCharge),
          notes: input.notes || null,
        },
        select: { id: true, cargoType: { select: { name: true } } },
      });

      await recordAudit(
        {
          actor: user,
          action: "pricing.publishRule",
          entity: "PricingRule",
          entityId: rule.id,
          summary:
            `Published USD ${input.price} ` +
            (input.method === "WEIGHT_BASED" ? "per kg" : "per item") +
            ` for ${rule.cargoType?.name ?? input.category}` +
            (superseded.count ? ` (superseded ${superseded.count} rule)` : ""),
          metadata: { ...input, superseded: superseded.count },
        },
        tx
      );

      return rule;
    });

    revalidatePath("/app/admin/pricing");
    revalidatePath("/calculator");
    revalidatePath("/rates");
    return ok({ id: created.id });
  } catch (error) {
    return fail(toActionError(error));
  }
}

/** Withdraws a price. Cargo it covered comes back unpriced, not free. */
export async function withdrawRule(
  ruleId: string
): Promise<ActionResult<{ id: string }>> {
  let user: SessionUser;
  try {
    user = await actor();
  } catch (error) {
    return fail(toActionError(error));
  }

  try {
    const rule = await prisma.pricingRule.findUnique({
      where: { id: ruleId },
      select: {
        active: true,
        price: true,
        category: true,
        cargoType: { select: { name: true } },
      },
    });
    if (!rule) return fail("That price no longer exists.");
    if (!rule.active) return fail("That price is already withdrawn.");

    await prisma.$transaction(async (tx) => {
      await tx.pricingRule.update({ where: { id: ruleId }, data: { active: false } });
      await recordAudit(
        {
          actor: user,
          action: "pricing.withdrawRule",
          entity: "PricingRule",
          entityId: ruleId,
          summary: `Withdrew USD ${rule.price.toString()} for ${
            rule.cargoType?.name ?? rule.category
          }`,
        },
        tx
      );
    });

    revalidatePath("/app/admin/pricing");
    revalidatePath("/calculator");
    revalidatePath("/rates");
    return ok({ id: ruleId });
  } catch (error) {
    return fail(toActionError(error));
  }
}
