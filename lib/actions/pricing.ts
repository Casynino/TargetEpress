"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
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

/*
 * The schemas are built per request rather than once at module load, because
 * every message in them is read by whoever is typing into the form. A schema
 * frozen at import time can only ever refuse in one language.
 */

const optionalNumber = (locale: Locale) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0),
      t(locale, "That number is not valid.")
    );

const productSchema = (locale: Locale) =>
  z.object({
    name: z.string().trim().min(2, t(locale, "Give the product a name.")),
    category: CATEGORY,
    route: ROUTE,
    keywords: z.string().trim().optional(),
  });

const ruleSchema = (locale: Locale) =>
  z
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
        .min(1, t(locale, "Enter the price."))
        .refine(
          (v) => !Number.isNaN(Number(v)),
          t(locale, "The price must be a number.")
        )
        .transform(Number)
        .refine((v) => v > 0, t(locale, "The price must be greater than zero.")),
      minWeightKg: optionalNumber(locale),
      maxWeightKg: optionalNumber(locale),
      minChargeableKg: optionalNumber(locale),
      minCharge: optionalNumber(locale),
      notes: z.string().trim().optional(),
    })
    .refine(
      (v) =>
        v.minWeightKg === null ||
        v.maxWeightKg === null ||
        v.maxWeightKg > v.minWeightKg,
      {
        message: t(locale, "The tier's upper bound must be above its lower bound."),
        path: ["maxWeightKg"],
      }
    )
    .refine((v) => v.method === "WEIGHT_BASED" || v.cargoTypeId !== null, {
      message: t(
        locale,
        "A fixed per-item price has to name the product it applies to."
      ),
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
  // viewerLocale is request-cached, so asking here costs nothing extra.
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await actor();
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = productSchema(locale).safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? t(locale, "Check the product details.")
    );
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
        return fail(
          `"${input.name}" ${t(locale, "already exists in that category.")}`
        );
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
    revalidatePath("/app/cargo/new");
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
  const locale = await viewerLocale();

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
    if (!product) return fail(t(locale, "That product no longer exists."));

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
    revalidatePath("/app/cargo/new");
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
  const locale = await viewerLocale();

  let user: SessionUser;
  try {
    user = await actor();
  } catch (error) {
    return fail(toActionError(error));
  }

  const parsed = ruleSchema(locale).safeParse(
    Object.fromEntries(formData) as Record<string, string>
  );
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? t(locale, "Check the price details.")
    );
  }
  const input = parsed.data;

  try {
    if (input.cargoTypeId) {
      const product = await prisma.cargoType.findUnique({
        where: { id: input.cargoTypeId },
        select: { category: true, active: true },
      });
      if (!product) return fail(t(locale, "That product no longer exists."));
      if (!product.active) {
        return fail(t(locale, "That product is archived. Restore it first."));
      }
      if (product.category !== input.category) {
        return fail(t(locale, "The product belongs to a different cargo category."));
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
  const locale = await viewerLocale();

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
    if (!rule) return fail(t(locale, "That price no longer exists."));
    if (!rule.active) return fail(t(locale, "That price is already withdrawn."));

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

/**
 * Change what something costs, without losing what it used to cost.
 *
 * From the desk's point of view this is "edit the price": type a new figure,
 * save, done. Underneath it is a withdrawal and a fresh publication in one
 * transaction, because a rate book that can be edited in place cannot answer
 * "what were we charging in March" — and that is the question that comes up
 * when a customer disputes an old invoice.
 *
 * Invoices already raised are untouched either way: each freezes its own figure
 * and its own exchange rate at the moment it was issued. This only changes what
 * the NEXT quote will say.
 */
export async function revisePrice(
  _prev: ActionResult<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  let user: SessionUser;
  try {
    user = await actor();
  } catch (error) {
    return fail(toActionError(error));
  }

  const ruleId = String(formData.get("ruleId") ?? "");
  const rawPrice = String(formData.get("price") ?? "").trim();
  const price = Number(rawPrice);
  if (!ruleId) return fail("Missing price.");
  if (!Number.isFinite(price) || price <= 0) {
    return fail("Enter a price greater than zero.");
  }
  if (price > 100_000) {
    return fail("That price looks wrong. Check the number of digits.");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.pricingRule.findUnique({
        where: { id: ruleId },
        include: { cargoType: { select: { name: true } } },
      });
      if (!current) throw new Error("That price no longer exists.");
      if (!current.active) {
        throw new Error(
          "That price has already been withdrawn. Publish a new one instead."
        );
      }
      if (toNumber(current.price) === price) {
        throw new Error("That is the price it is already set to.");
      }

      await tx.pricingRule.update({
        where: { id: ruleId },
        data: { active: false },
      });

      const rule = await tx.pricingRule.create({
        data: {
          category: current.category,
          cargoTypeId: current.cargoTypeId,
          method: current.method,
          price: new Prisma.Decimal(price),
          currency: current.currency,
          minWeightKg: current.minWeightKg,
          maxWeightKg: current.maxWeightKg,
          minChargeableKg: current.minChargeableKg,
          minCharge: current.minCharge,
          notes: current.notes,
        },
        select: { id: true },
      });

      await recordAudit(
        {
          actor: user,
          action: "pricing.revisePrice",
          entity: "PricingRule",
          entityId: rule.id,
          summary: `Changed ${current.cargoType?.name ?? current.category} from USD ${toNumber(current.price)} to USD ${price} ${current.method === "WEIGHT_BASED" ? "per kg" : "per item"}`,
          metadata: {
            from: toNumber(current.price),
            to: price,
            supersededRuleId: current.id,
          },
        },
        tx
      );

      return { id: rule.id };
    });

    revalidatePath("/app/finance/pricing");
    revalidatePath("/app/admin/pricing");
    revalidatePath("/calculator");
    return ok(result);
  } catch (error) {
    return fail(toActionError(error));
  }
}
