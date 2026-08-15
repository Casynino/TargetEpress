import type { CargoCategory, Origin, PricingMethod } from "@prisma/client";

import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

/**
 * Cargo classification rules.
 *
 * These are business rules, not rates: which airport a category flies from, and
 * which batches it may join. They live in code rather than the database on
 * purpose — a rate changes weekly, but "electronics fly out of Hong Kong" is
 * the shape of the operation. If it ever does change, it changes here, once.
 *
 * Rates are the opposite: they are entirely in the PricingRule table, editable
 * by the CEO, and nothing about them is hardcoded.
 */

/**
 * What the cargo is, in one line: the priced item first, then the desk's own
 * words in brackets — "Clothes (nguo)".
 *
 * The item is what Finance bills against and what everyone recognises at a
 * glance; the description is how the customer or the Guangzhou desk actually
 * named it, often in Swahili or Chinese. Showing only the description meant a
 * list full of words that do not map to any price, and showing only the item
 * meant nine rows that all say "Clothes".
 *
 * Either half may be missing — cargo can be registered as "Not listed / mixed",
 * and imported cargo sometimes has no description at all.
 */
export function cargoLabel(
  itemName: string | null | undefined,
  description: string | null | undefined,
  locale: Locale = "en"
) {
  const item = itemName?.trim();
  const text = description?.trim();

  if (!item) return text || t(locale, "General cargo");
  if (!text) return item;
  // "Clothes (Clothes)" helps nobody.
  if (text.toLowerCase() === item.toLowerCase()) return item;
  // Descriptions off the China packing lists carry their own brackets —
  // "Accessories (配件)". Wrapping those again gives nested brackets nobody can
  // read, so those get a dash instead.
  if (text.includes("(")) return `${item} — ${text}`;
  return `${item} (${text})`;
}

export const CATEGORY_LABELS: Record<CargoCategory, string> = {
  NORMAL_GOODS: "Normal goods",
  ELECTRONICS: "Electronics",
  LIQUID_SPECIAL: "Liquid & special goods",
};

export const CATEGORY_SW: Record<CargoCategory, string> = {
  NORMAL_GOODS: "Mizigo ya kawaida",
  ELECTRONICS: "Elektroniki",
  LIQUID_SPECIAL: "Vimiminika na mizigo maalum",
};

export const CATEGORY_EXAMPLES: Record<CargoCategory, string> = {
  NORMAL_GOODS:
    "Clothing, shoes, bags, home products, furniture, toys, general merchandise",
  ELECTRONICS:
    "Phones, laptops, tablets, smart watches, cameras, AirPods, speakers, batteries, chargers, printers, monitors, consoles, LED displays",
  LIQUID_SPECIAL: "Medicines, food products, liquids, oils",
};

/**
 * The route each category flies. This is the whole point of the classification:
 * the operator picks what the cargo IS, never which airport it leaves from, so
 * a shipment cannot be sent to the wrong hub by mistake.
 */
export const ROUTE_FOR_CATEGORY: Record<CargoCategory, Origin> = {
  NORMAL_GOODS: "GUANGZHOU",
  ELECTRONICS: "HONG_KONG",
  LIQUID_SPECIAL: "HONG_KONG",
};

export const AIRPORT_LABELS: Record<Origin, string> = {
  GUANGZHOU: "Guangzhou Airport",
  HONG_KONG: "Hong Kong Airport",
};

/** Which categories are allowed on a batch departing from a given airport. */
export const CATEGORIES_FOR_ROUTE: Record<Origin, CargoCategory[]> = {
  GUANGZHOU: ["NORMAL_GOODS"],
  HONG_KONG: ["ELECTRONICS", "LIQUID_SPECIAL"],
};

export const METHOD_LABELS: Record<PricingMethod, string> = {
  WEIGHT_BASED: "Weight-based",
  FIXED_PER_ITEM: "Fixed price per item",
};

export function routeFor(category: CargoCategory): Origin {
  return ROUTE_FOR_CATEGORY[category];
}

/**
 * True when a shipment of this category may join a batch leaving from this
 * airport. Enforced server-side on every path that assigns cargo to a batch.
 */
export function categoryFitsRoute(category: CargoCategory, route: Origin) {
  return ROUTE_FOR_CATEGORY[category] === route;
}

/** Batch number prefix per loading location: GZ-0028, HK-0013. */
export function batchPrefix(route: Origin) {
  return route === "GUANGZHOU" ? "GZ" : "HK";
}

/**
 * The shape of every batch number: GZ-0028, HK-0013.
 *
 * Where it loaded, then its place in that location's own run. The two runs are
 * independent — Hong Kong's fourteenth batch is HK-0014 whether Guangzhou has
 * sent four or four hundred — because they are two warehouses packing two sets
 * of cargo, and a shared counter would make each one's numbers jump for
 * reasons the other warehouse could not see.
 *
 * The run does not restart in January. A batch number is how the office refers
 * to a load for years afterwards, on paperwork that outlives the year it was
 * printed in, so GZ-0028 stays the only GZ-0028 there will ever be.
 *
 * Four digits so a column of them reads straight down, and more than four once
 * a location passes 9999 rather than rolling over onto a number already used.
 */
export const BATCH_NUMBER = /^(GZ|HK)-(\d{4,})$/;

/**
 * The notation the office wrote before this one: GZ/26-28.
 *
 * Recognised only so those batches keep their place in the run when they are
 * renumbered — the 28th Guangzhou load of 2026 becomes GZ-0028, not whatever
 * number happened to be free on the day the scheme changed.
 */
export const LEGACY_BATCH_NUMBER = /^(GZ|HK)\/(\d{2})-(\d{1,})$/;

/** A batch number, assembled. */
export function batchNumberFor(route: Origin, sequence: number) {
  return `${batchPrefix(route)}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Which loading location a batch number says it came from.
 *
 * The prefix is not decoration — it is the location, written down. Reading it
 * back is what lets every path that mints or imports a batch check the number
 * against the location instead of trusting them to agree. Returns null for
 * anything that is not a batch number, which includes the two permanent
 * loading tables (GZ-LOADING, HK-LOADING).
 */
export function originFromBatchNumber(batchNumber: string): Origin | null {
  const clean = batchNumber.trim().toUpperCase();
  const match = BATCH_NUMBER.exec(clean) ?? LEGACY_BATCH_NUMBER.exec(clean);
  if (!match) return null;
  return match[1] === "HK" ? "HONG_KONG" : "GUANGZHOU";
}

/** Its place in that location's run, or null if it is not a batch number. */
export function sequenceFromBatchNumber(batchNumber: string): number | null {
  const clean = batchNumber.trim().toUpperCase();
  const current = BATCH_NUMBER.exec(clean);
  if (current) return Number(current[2]);
  const legacy = LEGACY_BATCH_NUMBER.exec(clean);
  return legacy ? Number(legacy[3]) : null;
}

/**
 * Best-effort category from free-text cargo description, for importing packing
 * lists. Only ever a starting point: the operator confirms it, because getting
 * this wrong changes both the airport and the price.
 */
const CATEGORY_KEYWORDS: [RegExp, CargoCategory][] = [
  // Liquids and consumables first — several also match electronics words.
  [
    /蛋白粉|protein|保健品|health product|药|medicine|杀虫剂|insecticide|润滑剂|lubricant|肥皂|soap|香水|perfume|沐浴露|shower gel|眼膜|eye mask|凝胶|gel|草莓酱|jam|辣椒油|chili oil|食品|food|油|oil|液体|liquid|咖啡|coffee/i,
    "LIQUID_SPECIAL",
  ],
  [
    /手机|phone|ipad|平板|tablet|laptop|笔记本|电脑|computer|相机|camera|摄像头|耳机|earphone|airpod|手表|watch|音箱|speaker|电池|battery|充电器|charger|打印机|printer|显示器|monitor|led|playstation|游戏机|console|芯片|chip|内存卡|memory card|u盘|usb|路由器|router|遥控器|remote|电子|electronic|逆变器|inverter|测绘仪|surveying|反射仪|reflectometer|麦克风|microphone|电子秤|scale|3d打印|3d print|查价机|price checker|模块|module|定位器|gps|计时器|timer|自拍杆|selfie|按摩仪|massager|分析仪|analyzer|电机|motor|直播灯|streaming light|磨豆机|grinder|lcd|行车记录仪|dashboard camera/i,
    "ELECTRONICS",
  ],
];

export function guessCategory(text: string): CargoCategory {
  for (const [pattern, category] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) return category;
  }
  return "NORMAL_GOODS";
}
