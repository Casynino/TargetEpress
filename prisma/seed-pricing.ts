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
import {
  PrismaClient,
  Prisma,
  type CargoCategory,
  type Origin,
  type PricingMethod,
} from "@prisma/client";

const prisma = new PrismaClient();

const USD = "USD";
const OPENING_TZS_RATE = 2700;

type Product = {
  name: string;
  category: CargoCategory;
  method: PricingMethod;
  /** Per kg for WEIGHT_BASED, per piece for FIXED_PER_ITEM. */
  price?: number;
  route: Origin;
  keywords?: string;
  /** Weight-tier bounds, kg. Only normal goods use these. */
  minWeightKg?: number;
  maxWeightKg?: number;
};

/**
 * NORMAL GOODS — per kg, two tiers.
 *
 * Note what lives here rather than under electronics: LCD panels, memory cards
 * and car accessories. That is why they appear on Guangzhou packing lists.
 */
const NORMAL_GOODS: Product[] = [
  "Clothes",
  "Shoes",
  "Earrings",
  "Chains",
  "Rings (without stones)",
  "Wigs",
  "LCD",
  "Flash & Memory Cards",
  "Car Accessories",
  "General Merchandise",
  "Others",
].map((name) => ({
  name,
  category: "NORMAL_GOODS" as const,
  method: "WEIGHT_BASED" as const,
  route: "GUANGZHOU" as const,
}));

const NORMAL_GOODS_KEYWORDS: Record<string, string> = {
  Clothes: "clothes,clothing,衣服,garment,帽子,hat",
  Shoes: "shoes,鞋子,皮鞋,footwear,鞋带,鞋垫",
  Wigs: "wig,假发,hair,头发",
  LCD: "lcd,液晶,显示屏",
  "Flash & Memory Cards": "memory card,flash,u盘,u disk,内存卡,sd card",
  "Car Accessories": "car,auto,仪表盘,dashboard,活塞,piston,格栅,grille,减震器,shock absorber",
  "General Merchandise": "general,assorted,配件,accessories,杂货,箱包,bags,包包",
  Earrings: "earring,耳环",
  Chains: "chain,项链",
  "Rings (without stones)": "ring,戒指",
  Others: "other,misc",
};

/**
 * ELECTRONICS & SPECIAL GOODS — per kg at 13.50.
 *
 * These were previously seeded as fixed-price-per-item, which was wrong: a 30 kg
 * printer would have been billed as one USD 13.50 item instead of USD 405.
 */
const SPECIAL_PER_KG: Product[] = [
  { name: "Medicines & Food Stuff", keywords: "medicine,药,food,食品,蛋白粉,protein,保健品,capsule,胶囊,jam,酱" },
  { name: "Speakers", keywords: "speaker,音箱,耳机,earphone" },
  { name: "PlayStation", keywords: "playstation,console,游戏机" },
  { name: "Batteries", keywords: "battery,电池" },
  { name: "Monitors", keywords: "monitor,显示器" },
  { name: "Chargers", keywords: "charger,充电器" },
  { name: "Printers", keywords: "printer,打印机,3d printer" },
  { name: "Oils", keywords: "oil,油,lubricant,润滑剂,凝胶,gel,沐浴露" },
  { name: "LED Displays", keywords: "led,display" },
].map((item) => ({
  ...item,
  category: "LIQUID_SPECIAL" as const,
  method: "WEIGHT_BASED" as const,
  price: 13.5,
  route: "HONG_KONG" as const,
}));

/** ELECTRONICS — per piece, weight irrelevant. */
const PER_PIECE: Product[] = [
  { name: "Smart Phone (Full Box)", price: 25, keywords: "phone,smartphone,手机,full box" },
  { name: "Smart Phone (Unboxed)", price: 20, keywords: "unboxed,老人机,senior phone" },
  { name: "Laptop", price: 45, keywords: "laptop,notebook,笔记本,电脑" },
  { name: "Tablet", price: 25, keywords: "tablet,ipad,平板" },
  { name: "Kids Tablet", price: 15, keywords: "kids tablet,儿童平板" },
  { name: "Smart Watch", price: 10, keywords: "watch,手表" },
  { name: "Camera", price: 45, keywords: "camera,相机,摄像头" },
  { name: "Documents", price: 40, keywords: "document,papers,文件" },
  { name: "AirPods", price: 10, keywords: "airpods,earbuds" },
].map((item) => ({
  ...item,
  category: "ELECTRONICS" as const,
  method: "FIXED_PER_ITEM" as const,
  route: "HONG_KONG" as const,
}));

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
