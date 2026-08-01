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
  {
    slug: "baima-clothing-market",
    name: "Baima Clothing Market",
    nameCn: "白马服装市场",
    city: "Guangzhou, Guangdong",
    district: "Yuexiu, opposite Guangzhou railway station",
    route: "GUANGZHOU",
    hours: "Roughly 08:30–17:00; many stalls close by 16:00",
    bestFor: "Mid to high quality women's fashion, in season",
    summary:
      "The clothing market Guangzhou is known for, and the one most Tanzanian fashion traders end up in. Baima sells finished garments rather than fabric, and the quality sits noticeably above the cheaper markets around the station.",
    products: [
      "Women's dresses and two-pieces",
      "Blouses and tops",
      "Coats and jackets",
      "Occasion and evening wear",
      "Children's clothing",
      "Men's shirts and trousers",
    ],
    tips: [
      "Prices are quoted per piece but drop sharply at 5 to 10 pieces of the same style — ask for the wholesale price rather than accepting the first number.",
      "Many stalls are showrooms; the goods come from a warehouse and can take a day. Do not plan to buy and fly the same afternoon.",
      "The buildings immediately around the station are cheaper and noticeably lower quality. If you are selling on quality, stay inside Baima.",
      "New season styles arrive constantly. Ask what is new this week rather than pointing at the catalogue.",
    ],
  },
  {
    slug: "huaqiangbei-electronics",
    name: "Huaqiangbei Electronics Market",
    nameCn: "华强北电子市场",
    city: "Shenzhen, Guangdong",
    district: "Futian",
    route: "HONG_KONG",
    hours: "Roughly 10:00–18:00; quieter on Mondays",
    bestFor: "Phone parts, accessories and repair components",
    summary:
      "Several enormous buildings of electronics stacked floor by floor. Huaqiangbei is where phone repairers and accessory sellers buy, and it has a depth of component stock that exists almost nowhere else.",
    products: [
      "Phone screens and repair parts",
      "Chargers, cables and power banks",
      "Earphones and speakers",
      "Phone cases and accessories",
      "Smart watches",
      "Tools and testing equipment",
    ],
    tips: [
      "Test everything at the stall. A screen or a battery that fails is not something you can return from Dar es Salaam.",
      "Grades matter enormously on screens — original, copy and refurbished are three different products at three prices. Know which you are buying.",
      "Electronics fly from Hong Kong, not Guangzhou, and are priced differently. Tell us what you are buying before you ship.",
      "Batteries and power banks have their own rules. Declare them; they are the single most common cause of a consignment being held.",
    ],
  },
  {
    slug: "guangzhou-shoe-markets",
    name: "Guangzhou Shoe Markets",
    nameCn: "广州鞋业市场",
    city: "Guangzhou, Guangdong",
    district: "Zhanxi and Buyun, near the railway station",
    route: "GUANGZHOU",
    hours: "Roughly 09:00–17:00",
    bestFor: "Footwear in every price bracket, by the carton",
    summary:
      "A cluster of shoe buildings within walking distance of each other. Zhanxi leans towards fashion and women's shoes; the Buyun buildings carry more sports and men's footwear.",
    products: [
      "Women's fashion shoes and sandals",
      "Sports and running shoes",
      "Men's formal shoes",
      "Children's shoes",
      "Slippers and sandals",
      "Bags matched to shoe styles",
    ],
    tips: [
      "Shoes are sold by the carton in mixed size runs. Ask exactly which sizes are in the carton before agreeing — a carton weighted to sizes nobody wears is money lost.",
      "Ask for the box weight. Shoes are light and bulky, which is the combination that costs most to fly.",
      "Branded lookalikes are everywhere here and are the goods most likely to attract attention at customs.",
    ],
  },
  {
    slug: "guangzhou-auto-parts",
    name: "Guangzhou Auto Parts Markets",
    nameCn: "广州汽车配件市场",
    city: "Guangzhou, Guangdong",
    district: "Yuexiu and Baiyun",
    route: "GUANGZHOU",
    hours: "Roughly 09:00–17:30; closed some Sundays",
    bestFor: "Spare parts and accessories for common models",
    summary:
      "Streets of parts shops organised loosely by system — body panels in one area, electrical in another. Strongest on the Japanese and Chinese models most common on Tanzanian roads.",
    products: [
      "Filters, belts and brake parts",
      "Lights and body panels",
      "Suspension and steering components",
      "Car electronics and audio",
      "Interior accessories and mats",
      "Tools and workshop equipment",
    ],
    tips: [
      "Bring the part number or the old part. Model names differ between markets and a description is not enough.",
      "Parts are heavy and dense, which is the cheapest thing per kilo to fly — this is a category where air freight competes well with sea.",
      "Ask whether it is original, OEM or aftermarket, and price all three. The gap is large and so is the quality difference.",
    ],
  },
  {
    slug: "guzhen-lighting-market",
    name: "Guzhen Lighting Market",
    nameCn: "古镇灯饰城",
    city: "Zhongshan, Guangdong",
    district: "Guzhen town",
    route: "GUANGZHOU",
    hours: "Roughly 09:00–18:00",
    bestFor: "Lighting of every kind, from bulbs to chandeliers",
    summary:
      "An entire town given over to lighting, roughly an hour and a half from Guangzhou. If it lights up, it is made or sold here.",
    products: [
      "LED bulbs and tubes",
      "Ceiling and pendant lights",
      "Chandeliers",
      "Outdoor and solar lighting",
      "Strip and decorative lighting",
      "Switches and fittings",
    ],
    tips: [
      "Chandeliers and glass fittings are fragile and bulky — get them packed properly at the market, not at our warehouse.",
      "Check the voltage. Tanzania runs 230V and a great deal of stock here is made for other markets.",
      "Solar lighting sells well in Tanzania but quality varies enormously. Buy a sample and leave it in the sun for a week before ordering.",
    ],
  },
  {
    slug: "chenghai-toy-market",
    name: "Chenghai Toy Markets",
    nameCn: "澄海玩具市场",
    city: "Shantou, Guangdong",
    district: "Chenghai",
    route: "GUANGZHOU",
    hours: "Roughly 09:00–17:30",
    bestFor: "Toys at factory prices, in volume",
    summary:
      "China's toy manufacturing base. Yiwu sells toys; Chenghai makes them, so the prices are lower and the minimum orders higher.",
    products: [
      "Remote control cars and drones",
      "Dolls and figures",
      "Educational and building toys",
      "Outdoor and sports toys",
      "Battery-operated toys",
      "Party and novelty items",
    ],
    tips: [
      "Toys are the definition of light and bulky. Work out the freight before the order, not after — it is often more than the goods.",
      "Anything with a battery included needs declaring and may need to fly from Hong Kong.",
      "Minimum orders are factory-sized here. If you want small quantities, buy the same goods in Yiwu instead.",
    ],
  },
  {
    slug: "packaging-materials-market",
    name: "Guangzhou Packaging Markets",
    nameCn: "广州包装材料市场",
    city: "Guangzhou, Guangdong",
    district: "Liwan",
    route: "GUANGZHOU",
    hours: "Roughly 09:00–17:00",
    bestFor: "Boxes, bags and branded packaging for your own products",
    summary:
      "Where sellers buy the packaging their goods go out in. Useful if you are building a brand rather than reselling somebody else's.",
    products: [
      "Printed cartons and gift boxes",
      "Branded paper and plastic bags",
      "Labels and stickers",
      "Bubble wrap and protective material",
      "Bottles, jars and cosmetic containers",
      "Ribbon and finishing materials",
    ],
    tips: [
      "Printing your own branding usually needs a minimum of a few thousand units. Ask before you design.",
      "Packaging is bulky and cheap, which makes it the worst possible thing to air freight. Consider buying it locally in Dar unless it is genuinely unavailable.",
      "Order packaging and product together so the sizes actually match — this is the most common mistake first-time brand builders make.",
    ],
  },
];

export function marketBySlug(slug: string) {
  return MARKETS.find((market) => market.slug === slug) ?? null;
}
