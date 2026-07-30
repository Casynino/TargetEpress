/**
 * Seed content for the China markets directory.
 *
 * NOT what the site renders. The live directory is the ChinaMarket table, which
 * the CEO edits at /app/admin/markets; this file only supplies the opening set
 * via prisma/seed-markets.ts, which never overwrites an edited row. Changing
 * text here will not change the site.
 *
 * Everything here is stated at the level it can be relied on. Opening hours and
 * districts are stable; specific stall numbers and prices are not, so they are
 * absent rather than invented. Where a detail should be confirmed before a
 * customer travels, `verify` says so.
 */

export type Market = {
  slug: string;
  name: string;
  nameCn: string;
  city: string;
  district: string;
  /** Which of our two air routes this market's goods normally fly out on. */
  route: "GUANGZHOU" | "HONG_KONG";
  hours: string;
  /** One line: who should go here. */
  bestFor: string;
  summary: string;
  products: string[];
  tips: string[];
  /** True when details are worth reconfirming before a customer books travel. */
  verify?: string;
};

export const MARKETS: Market[] = [
  {
    slug: "yiwu-international-trade-city",
    name: "Yiwu International Trade City",
    nameCn: "义乌国际商贸城",
    city: "Yiwu, Zhejiang",
    district: "Futian",
    route: "GUANGZHOU",
    hours: "Roughly 09:00–17:00 daily; districts close in rotation on holidays",
    bestFor: "Small goods in volume — the widest single range in China",
    summary:
      "The largest small-commodity wholesale market in the world, laid out as five numbered districts across several buildings. Traders come here when they want many different products in one trip rather than one product in depth.",
    products: [
      "Toys and games",
      "Jewellery and accessories",
      "Stationery",
      "Kitchenware and household goods",
      "Hair accessories and wigs",
      "Festival and party goods",
      "Luggage and bags",
    ],
    tips: [
      "Allow at least two full days. One district alone takes a morning to walk.",
      "Minimum order quantities are low here compared with factory buying, which is why it suits first-time importers.",
      "Goods bought here normally consolidate through Guangzhou for the flight to Dar es Salaam.",
    ],
  },
  {
    slug: "guangzhou-wholesale-markets",
    name: "Guangzhou Wholesale Markets",
    nameCn: "广州批发市场",
    city: "Guangzhou, Guangdong",
    district: "Baiyun, Liwan and Yuexiu",
    route: "GUANGZHOU",
    hours: "Most markets 09:00–18:00; leather and clothing markets start earlier",
    bestFor: "Clothing, shoes, bags and general merchandise",
    summary:
      "Not one market but a cluster across the city, each with its own speciality: Baiyun for leather and bags, Shahe and Thirteen Hang for clothing, Zhanxi for wholesale fashion. This is where most Tanzanian traders buy.",
    products: [
      "Clothing, new and boutique",
      "Shoes and footwear",
      "Handbags and leather goods",
      "Watches and fashion accessories",
      "General merchandise",
    ],
    tips: [
      "Our Guangzhou warehouse is in this city, so goods bought here reach us the same day.",
      "Clothing markets trade early — several are winding down by mid-afternoon.",
      "Ask for the wholesale price, not the display price. The first number is rarely the last.",
    ],
  },
  {
    slug: "shenzhen-electronics-markets",
    name: "Shenzhen Electronics Markets",
    nameCn: "深圳电子市场",
    city: "Shenzhen, Guangdong",
    district: "Huaqiangbei",
    route: "HONG_KONG",
    hours: "Roughly 10:00–19:00; some buildings close Mondays",
    bestFor: "Phones, components, accessories and repair parts",
    summary:
      "Huaqiangbei is several multi-storey buildings of electronics stacked on one another — SEG, Huaqiang Plaza and the surrounding towers. Floors are organised by product, from finished phones down to individual components.",
    products: [
      "Smartphones and tablets",
      "Chargers, cables and power banks",
      "LED displays and modules",
      "Repair parts and tools",
      "Audio equipment and speakers",
      "Cameras and accessories",
    ],
    tips: [
      "Electronics from Shenzhen normally fly out of Hong Kong, which is our electronics route.",
      "Test every device in front of the seller before paying. Nobody honours a complaint made after you leave the building.",
      "Batteries and power banks are restricted cargo — tell us before you buy so we can route them correctly.",
    ],
    verify:
      "Building opening days vary. Confirm with your supplier before travelling for a specific tower.",
  },
  {
    slug: "foshan-furniture-markets",
    name: "Foshan Furniture Markets",
    nameCn: "佛山家具市场",
    city: "Foshan, Guangdong",
    district: "Lecong and Longjiang",
    route: "GUANGZHOU",
    hours: "Roughly 09:00–18:00 daily",
    bestFor: "Furniture, fittings and interior goods",
    summary:
      "The Lecong furniture belt runs for kilometres along one road — showroom after showroom of sofas, beds, office furniture and fittings. An hour from Guangzhou, so it pairs naturally with a Guangzhou buying trip.",
    products: [
      "Sofas and living room sets",
      "Beds and mattresses",
      "Office furniture",
      "Lighting and fittings",
      "Kitchen cabinets",
      "Decorative items",
    ],
    tips: [
      "Furniture is bulky rather than heavy. Talk to us about cost before you commit — air freight prices on weight, and volume can make sea freight the better answer.",
      "Ask for the packed dimensions of each item, not just the assembled size.",
    ],
  },
  {
    slug: "zhongda-fabric-market",
    name: "Zhongda Fabric Market",
    nameCn: "中大布匹市场",
    city: "Guangzhou, Guangdong",
    district: "Haizhu, near Sun Yat-sen University",
    route: "GUANGZHOU",
    hours: "Roughly 09:00–17:30; quieter on Sundays",
    bestFor: "Fabric by the roll, trimmings and tailoring supplies",
    summary:
      "China's largest textile trading area — dozens of buildings selling fabric by the roll, plus buttons, zips, lace and everything else a tailor needs. The natural stop for anyone in the kitenge, bridal or uniform trade.",
    products: [
      "Cotton, silk and synthetic fabrics",
      "Lace and embroidery",
      "Bridal and evening fabrics",
      "Buttons, zips and trimmings",
      "Lining and interfacing",
    ],
    tips: [
      "Take a physical sample of what you want. Colour names travel badly; a swatch does not.",
      "Fabric is sold by the roll or by the metre — confirm which price you are being quoted.",
    ],
  },
  {
    slug: "keqiao-textile-market",
    name: "Keqiao Textile Market",
    nameCn: "柯桥轻纺城",
    city: "Shaoxing, Zhejiang",
    district: "Keqiao",
    route: "GUANGZHOU",
    hours: "Roughly 08:30–17:00 daily",
    bestFor: "Textiles in volume, direct from the mills",
    summary:
      "China Textile City in Keqiao is the country's largest textile distribution centre, close to the mills that weave and print the cloth. Prices reflect that proximity, which is why buyers in volume come here rather than to a city market.",
    products: [
      "Printed and dyed fabrics",
      "Curtain and upholstery fabric",
      "Home textiles and bedding",
      "Garment fabric in bulk",
    ],
    tips: [
      "About an hour from Hangzhou and close to Yiwu — most traders combine the two on one trip.",
      "Minimum orders are higher here than at a city market. It rewards volume, not variety.",
    ],
  },
];

export function marketBySlug(slug: string) {
  return MARKETS.find((market) => market.slug === slug) ?? null;
}
