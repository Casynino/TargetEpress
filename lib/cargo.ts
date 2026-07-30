import type { CargoCategory, Origin, PricingMethod } from "@prisma/client";

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

/** Batch number prefix per route, e.g. GZ-2026-001 / HK-2026-005. */
export function batchPrefix(route: Origin) {
  return route === "GUANGZHOU" ? "GZ" : "HK";
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
