/**
 * Seeds products, the rate book and the opening exchange rate from the CEO's
 * published price list.
 *
 *   npx tsx prisma/seed-pricing.ts            # add anything missing
 *   npx tsx prisma/seed-pricing.ts --reset    # rebuild the book from scratch
 *
 * `--reset` deactivates every existing rule and rewrites the book. Use it after
 * a price list revision. Without it the script only fills gaps, so it is safe to
 * re-run and will never quietly change a live price.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  NORMAL_GOODS,
  NORMAL_GOODS_KEYWORDS,
  OPENING_TZS_RATE,
  PER_PIECE,
  SPECIAL_PER_KG,
  USD,
  type Product,
} from "./price-list";

const prisma = new PrismaClient();

async function upsertProduct(product: Product, sortOrder: number) {
  const existing = await prisma.cargoType.findUnique({
    where: { category_name: { category: product.category, name: product.name } },
    select: { id: true },
  });

  if (existing) {
    await prisma.cargoType.update({
      where: { id: existing.id },
      data: { route: product.route, active: true, sortOrder },
    });
    return existing.id;
  }

  const created = await prisma.cargoType.create({
    data: {
      name: product.name,
      category: product.category,
      keywords: product.keywords ?? NORMAL_GOODS_KEYWORDS[product.name] ?? null,
      route: product.route,
      sortOrder,
    },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const reset = process.argv.includes("--reset");

  if (reset) {
    const { count } = await prisma.pricingRule.updateMany({
      where: { active: true },
      data: { active: false },
    });
    console.log(`Deactivated ${count} existing rule(s) — rebuilding the book.`);
  }

  let order = 0;
  let rules = 0;

  const addRule = async (data: Prisma.PricingRuleUncheckedCreateInput) => {
    const clash = await prisma.pricingRule.findFirst({
      where: {
        active: true,
        category: data.category,
        cargoTypeId: data.cargoTypeId ?? null,
        method: data.method,
        minWeightKg: data.minWeightKg ?? null,
        maxWeightKg: data.maxWeightKg ?? null,
      },
      select: { id: true },
    });
    if (clash) return;
    await prisma.pricingRule.create({ data });
    rules++;
  };

  // ---------------------------------------------------------- normal goods
  for (const product of NORMAL_GOODS) await upsertProduct(product, order++);

  // Tiers are data, so the engine needs no special case for "under ten kilos".
  await addRule({
    category: "NORMAL_GOODS",
    cargoTypeId: null,
    method: "WEIGHT_BASED",
    price: new Prisma.Decimal(13.5),
    currency: USD,
    maxWeightKg: new Prisma.Decimal(10),
    notes: "Under 10 kg.",
  });
  await addRule({
    category: "NORMAL_GOODS",
    cargoTypeId: null,
    method: "WEIGHT_BASED",
    price: new Prisma.Decimal(12.5),
    currency: USD,
    minWeightKg: new Prisma.Decimal(10),
    notes: "10 kg and above.",
  });

  // ------------------------------------------- electronics & special, per kg
  order = 0;
  for (const product of SPECIAL_PER_KG) await upsertProduct(product, order++);

  // One category-wide rule covers the lot, and also catches anything the
  // Hong Kong desk sends that is not on the per-piece list.
  await addRule({
    category: "LIQUID_SPECIAL",
    cargoTypeId: null,
    method: "WEIGHT_BASED",
    price: new Prisma.Decimal(13.5),
    currency: USD,
    notes: "All weights.",
  });

  // ------------------------------------------------------ electronics, per piece
  order = 0;
  for (const product of PER_PIECE) {
    const id = await upsertProduct(product, order++);
    await addRule({
      category: "ELECTRONICS",
      cargoTypeId: id,
      method: "FIXED_PER_ITEM",
      price: new Prisma.Decimal(product.price!),
      currency: USD,
      notes: "Per item, any weight.",
    });
  }

  // An electronics item not on the per-piece list falls back to per-kg rather
  // than coming back unpriced — this is what the revised list asks for.
  await addRule({
    category: "ELECTRONICS",
    cargoTypeId: null,
    method: "WEIGHT_BASED",
    price: new Prisma.Decimal(13.5),
    currency: USD,
    notes: "Electronics not on the fixed-price list — charged by weight.",
  });

  // ----------------------------------------------------------- opening FX rate
  const existingRate = await prisma.exchangeRate.findFirst({
    where: { active: true, fromCurrency: "USD", toCurrency: "TZS" },
  });
  if (!existingRate) {
    await prisma.exchangeRate.create({
      data: {
        rate: new Prisma.Decimal(OPENING_TZS_RATE),
        notes: "Opening rate from the price list. Update it in Finance.",
      },
    });
    console.log(`Opening exchange rate set: 1 USD = ${OPENING_TZS_RATE} TZS`);
  }

  const [products, active] = await Promise.all([
    prisma.cargoType.count({ where: { active: true } }),
    prisma.pricingRule.count({ where: { active: true } }),
  ]);

  console.log(`Products: ${products} active`);
  console.log(`Pricing rules: ${active} active (${rules} added this run)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
