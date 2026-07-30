/**
 * The CEO's published price list, as data.
 *
 * Extracted so that seeding and the catalogue clean-up read the same list. Two
 * copies of "what products exist" is how the catalogue ended up with both
 * "Clothes" and "Clothing" in it.
 */
import type { CargoCategory, Origin, PricingMethod } from "@prisma/client";

export const USD = "USD";
export const OPENING_TZS_RATE = 2700;

export type Product = {
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
export const NORMAL_GOODS: Product[] = [
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

export const NORMAL_GOODS_KEYWORDS: Record<string, string> = {
  Clothes: "clothes,clothing,衣服,garment,帽子,hat",
  Shoes: "shoes,鞋子,皮鞋,footwear,鞋带,鞋垫",
  Wigs: "wig,wigs,假发",
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
export const SPECIAL_PER_KG: Product[] = [
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
export const PER_PIECE: Product[] = [
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

