/**
 * The picture library.
 *
 * Every id here has been checked to load. Photographs are named by what they
 * show rather than where they are used, so a card can pick the right image
 * instead of the next one in a list — a shoe market with a photograph of a
 * warehouse is worse than no photograph at all.
 *
 * Kept in one file for a practical reason: when these are eventually replaced
 * with the company's own photography — which they should be — it is one file
 * to edit, not thirty components to hunt through.
 */
const UNSPLASH = "https://images.unsplash.com/photo-";

function photo(id: string) {
  return `${UNSPLASH}${id}`;
}

export const IMAGES = {
  // Operations
  apron: photo("1515780855147-aee414989c82"),
  warehouseAisle: photo("1553413077-190dd305871c"),
  loadingTruck: photo("1601584115197-04ecc0da31d7"),
  cargoHold: photo("1587293852726-70cdb56c2866"),
  packedCartons: photo("1595246140625-573b715d11dc"),
  airportNight: photo("1520437358207-323b43b50729"),
  paperwork: photo("1450101499163-c8848c66ca85"),

  // Goods and markets
  clothingRail: photo("1441986300917-64674bd600d8"),
  electronicsBench: photo("1498049794561-7780e7231661"),
  sneakers: photo("1549298916-b41d501d3772"),
  fabricRolls: photo("1558769132-cb1aea458c5e"),
  furniture: photo("1555041469-a586c61ea9bc"),
  lighting: photo("1524484485831-a92ffc0de03f"),
  autoParts: photo("1486262715619-67b85e0b08d3"),
  packaging: photo("1607083206968-13611e3d76db"),
} as const;

/** A sized, cropped, format-negotiated URL. */
export function img(url: string, width: number, quality = 68) {
  return `${url}?auto=format&fit=crop&w=${width}&q=${quality}`;
}

/**
 * Which photograph belongs to which market.
 *
 * Falls back to a warehouse aisle rather than a random image: a generic but
 * plausible picture beats a picture of the wrong thing.
 */
const MARKET_IMAGES: Record<string, string> = {
  "yiwu-international-trade-city": IMAGES.packedCartons,
  "guangzhou-wholesale-markets": IMAGES.clothingRail,
  "shenzhen-electronics-markets": IMAGES.electronicsBench,
  "foshan-furniture-markets": IMAGES.furniture,
  "zhongda-fabric-market": IMAGES.fabricRolls,
  "keqiao-textile-market": IMAGES.fabricRolls,
  "baima-clothing-market": IMAGES.clothingRail,
  "huaqiangbei-electronics": IMAGES.electronicsBench,
  "guangzhou-shoe-markets": IMAGES.sneakers,
  "guangzhou-auto-parts": IMAGES.autoParts,
  "guzhen-lighting-market": IMAGES.lighting,
  "chenghai-toy-market": IMAGES.packedCartons,
  "packaging-materials-market": IMAGES.packaging,
};

export function marketImage(slug: string) {
  return MARKET_IMAGES[slug] ?? IMAGES.warehouseAisle;
}
