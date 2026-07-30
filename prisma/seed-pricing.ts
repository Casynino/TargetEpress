/**
 * Seeds the cargo types and the rate book from the CEO's published price list.
 *
 *   npx tsx prisma/seed-pricing.ts
 *
 * Idempotent: existing cargo types are matched by (category, name) and their
 * rules are left alone. Re-running never silently changes a live rate — to
 * change a price, add a new rule with a later effectiveFrom, which is what the
 * pricing admin screen does.
 */
import { PrismaClient, Prisma, type CargoCategory } from "@prisma/client";

const prisma = new PrismaClient();

const USD = "USD";

/** Electronics: fixed price per item, exactly as supplied. */
const ELECTRONICS: { name: string; price: number; keywords?: string }[] = [
  { name: "Smart Phone (Full Box)", price: 25, keywords: "phone,smartphone,手机,full box" },
  { name: "Smart Phone (Unboxed)", price: 20, keywords: "unboxed phone,老人机,senior phone" },
  { name: "Laptop", price: 45, keywords: "laptop,notebook,笔记本,电脑" },
  { name: "Tablet", price: 25, keywords: "tablet,ipad,平板" },
  { name: "Kids Tablet", price: 15, keywords: "kids tablet,children tablet,儿童平板" },
  { name: "Smart Watch", price: 10, keywords: "watch,smart watch,手表" },
  { name: "Camera", price: 45, keywords: "camera,相机,摄像头" },
  { name: "Documents", price: 40, keywords: "documents,papers,文件" },
  { name: "AirPods", price: 10, keywords: "airpods,earbuds,耳机" },
  { name: "Speakers", price: 13.5, keywords: "speaker,音箱" },
  { name: "Battery", price: 13.5, keywords: "battery,电池" },
  { name: "Chargers", price: 13.5, keywords: "charger,充电器" },
  { name: "Printers", price: 13.5, keywords: "printer,打印机,3d printer" },
  { name: "Monitors", price: 13.5, keywords: "monitor,显示器" },
  { name: "LED Displays", price: 13.5, keywords: "led,display,lcd" },
  { name: "PlayStation", price: 13.5, keywords: "playstation,console,游戏机" },
];

/** Selectable types for the weight-based categories. Priced by category. */
const NORMAL_GOODS = [
  { name: "Clothing", keywords: "clothes,clothing,衣服,garment" },
  { name: "Shoes", keywords: "shoes,鞋子,皮鞋,footwear" },
  { name: "Bags", keywords: "bag,bags,箱包,包包,luggage" },
  { name: "Home products", keywords: "home,kitchen,厨具,置物架" },
  { name: "Furniture", keywords: "furniture,家具,沙发" },
  { name: "Toys", keywords: "toy,toys,玩具" },
  { name: "General merchandise", keywords: "general,assorted,配件,accessories,杂货" },
];

const LIQUID_SPECIAL = [
  { name: "Medicines", keywords: "medicine,药,capsule,胶囊" },
  { name: "Food products", keywords: "food,食品,jam,酱,coffee,咖啡" },
  { name: "Liquids", keywords: "liquid,液体,gel,凝胶,shower gel,沐浴露" },
  { name: "Oils", keywords: "oil,油,lubricant,润滑剂" },
  { name: "Health & personal care", keywords: "health,保健品,soap,肥皂,perfume,香水" },
];

async function ensureType(
  category: CargoCategory,
  name: string,
  keywords: string | undefined,
  sortOrder: number
) {
  const existing = await prisma.cargoType.findUnique({
    where: { category_name: { category, name } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.cargoType.create({
    data: { category, name, keywords, sortOrder },
    select: { id: true },
  });
  return created.id;
}

async function ensureRule(data: Prisma.PricingRuleUncheckedCreateInput) {
  const existing = await prisma.pricingRule.findFirst({
    where: {
      category: data.category,
      cargoTypeId: data.cargoTypeId ?? null,
      method: data.method,
      minWeightKg: data.minWeightKg ?? null,
      maxWeightKg: data.maxWeightKg ?? null,
      active: true,
    },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.pricingRule.create({ data });
  return true;
}

async function main() {
  let types = 0;
  let rules = 0;

  // ------------------------------------------------------- Normal goods
  // Weight-based, two tiers. The tiers are data, so the engine needs no
  // special case for "under ten kilos".
  let order = 0;
  for (const type of NORMAL_GOODS) {
    await ensureType("NORMAL_GOODS", type.name, type.keywords, order++);
    types++;
  }

  if (
    await ensureRule({
      category: "NORMAL_GOODS",
      cargoTypeId: null,
      method: "WEIGHT_BASED",
      price: new Prisma.Decimal(13.5),
      currency: USD,
      minWeightKg: null,
      maxWeightKg: new Prisma.Decimal(10),
      notes: "Under 10 kg.",
    })
  )
    rules++;

  if (
    await ensureRule({
      category: "NORMAL_GOODS",
      cargoTypeId: null,
      method: "WEIGHT_BASED",
      price: new Prisma.Decimal(12.5),
      currency: USD,
      minWeightKg: new Prisma.Decimal(10),
      maxWeightKg: null,
      notes: "10 kg and above.",
    })
  )
    rules++;

  // -------------------------------------------------------- Electronics
  // Fixed price per item. No category-wide fallback is seeded on purpose: an
  // electronics item that is not on the list must come back as "no published
  // rate" so the CEO prices it, rather than the system quietly guessing.
  order = 0;
  for (const item of ELECTRONICS) {
    const id = await ensureType("ELECTRONICS", item.name, item.keywords, order++);
    types++;
    if (
      await ensureRule({
        category: "ELECTRONICS",
        cargoTypeId: id,
        method: "FIXED_PER_ITEM",
        price: new Prisma.Decimal(item.price),
        currency: USD,
        notes: "Per item, any weight.",
      })
    )
      rules++;
  }

  // --------------------------------------------- Liquid & special goods
  order = 0;
  for (const type of LIQUID_SPECIAL) {
    await ensureType("LIQUID_SPECIAL", type.name, type.keywords, order++);
    types++;
  }

  if (
    await ensureRule({
      category: "LIQUID_SPECIAL",
      cargoTypeId: null,
      method: "WEIGHT_BASED",
      price: new Prisma.Decimal(13.5),
      currency: USD,
      notes: "All weights.",
    })
  )
    rules++;

  const [typeCount, ruleCount] = await Promise.all([
    prisma.cargoType.count(),
    prisma.pricingRule.count({ where: { active: true } }),
  ]);

  console.log(`Cargo types: ${typeCount} (${types} checked)`);
  console.log(`Active pricing rules: ${ruleCount} (${rules} added this run)`);
  console.log("\nRoutes are derived, not stored:");
  console.log("  Normal goods            → Guangzhou Airport");
  console.log("  Electronics             → Hong Kong Airport");
  console.log("  Liquid & special goods  → Hong Kong Airport");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
