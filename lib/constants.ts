import type {
  BatchStatus,
  Department,
  ExceptionType,
  GoodsType,
  Origin,
  PaymentMethod,
  Role,
  ShipmentStatus,
} from "@prisma/client";

/**
 * Single source of truth for every label the UI renders. Warehouse staff type
 * as little as possible — everything selectable comes from these lists.
 */

/**
 * Real company details, taken from the @targetexpress_ Instagram profile.
 *
 * The Swahili strings are the company's own words — most customers are Swahili
 * speakers and this is the voice they already recognise. Do not "improve" the
 * translation without asking the owner.
 */
export const COMPANY = {
  name: "Target Express Air Cargo",
  shortName: "Target Express",

  /** The promise the business is built on: three days, door to door. */
  promiseSw: "Ndani ya siku tatu, mzigo wako uko mlangoni!",
  promiseEn: "Within three days, your cargo is at your door.",
  taglineSw: "Kutoka China kwa bei nafuu",
  taglineEn: "From China, at a fair price",

  phone: process.env.NEXT_PUBLIC_COMPANY_PHONE ?? "+255 688 887 784",
  phoneAlt: "+255 628 430 911",
  whatsapp: process.env.NEXT_PUBLIC_COMPANY_WHATSAPP ?? "255688887784",
  email: process.env.NEXT_PUBLIC_COMPANY_EMAIL ?? "info@targetexpress.co.tz",

  instagram: "targetexpress_",
  instagramUrl: "https://www.instagram.com/targetexpress_",
  instagramFollowers: "7,200+",
  iosApp: "https://apps.apple.com/tz/app/targetexpresscargo/id1547951657",

  /** Tanzanian collection points. */
  offices: [
    {
      id: "aggrey",
      city: "Dar es Salaam",
      name: "Aggrey office",
      address: "Aggrey / Likoma Street, near Mkombozi Bank",
      note: "Main collection point.",
      phones: ["+255 688 887 784", "+255 628 430 911"],
    },
    {
      id: "ndanda",
      city: "Dar es Salaam",
      name: "Ndanda office",
      address: "Ndanda Street",
      note: "Second collection point.",
      phones: ["+255 688 887 784"],
    },
  ],

  /** Where suppliers in China deliver. The Chinese text matters — send it to them as-is. */
  chinaOffice: {
    city: "Guangzhou",
    addressCn:
      "广州市白云区金沙洲环洲三路 ECAT 文化创意园 B 栈 121 及 218 室",
    addressEn:
      "ECAT Cultural Park, Huanzhou 3rd Road, Jinshazhou, Baiyun District, Guangzhou",
    rooms: "Building B, Rooms 121 & 218",
    phones: ["+86 191 2866 4885", "+86 131 6834 2573", "+86 136 9970 9572"],
  },

  // Kept for printed documents, which need one short line per location.
  darAddress: "Aggrey / Likoma Street, near Mkombozi Bank, Dar es Salaam",
  chinaAddress: "ECAT Cultural Park, Jinshazhou, Baiyun District, Guangzhou",
} as const;

export const DEFAULT_CURRENCY = "TZS";

// ---------------------------------------------------------------------------
// Roles & departments
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "CEO / Admin",
  CHINA_WAREHOUSE: "China Warehouse",
  DAR_WAREHOUSE: "Dar Warehouse",
  FINANCE: "Finance",
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  MANAGEMENT: "Management",
  CHINA_WAREHOUSE: "China Warehouse",
  DAR_WAREHOUSE: "Dar es Salaam Warehouse",
  FINANCE: "Finance",
};

/** The department a role belongs to by default when an admin creates a user. */
export const ROLE_DEFAULT_DEPARTMENT: Record<Role, Department> = {
  ADMIN: "MANAGEMENT",
  CHINA_WAREHOUSE: "CHINA_WAREHOUSE",
  DAR_WAREHOUSE: "DAR_WAREHOUSE",
  FINANCE: "FINANCE",
};

// ---------------------------------------------------------------------------
// Shipment status
// ---------------------------------------------------------------------------

type StatusMeta = {
  label: string;
  /** What the customer is told. Never mentions staff or internal process. */
  publicLabel: string;
  publicLocation: string;
  description: string;
  /** Badge variant from components/ui/badge. */
  tone: "muted" | "info" | "warning" | "success" | "brand" | "destructive";
  /** Which department is accountable for moving it forward. */
  owner: string;
};

export const SHIPMENT_STATUS_META: Record<ShipmentStatus, StatusMeta> = {
  READY_TO_DEPART: {
    label: "Ready to depart",
    publicLabel: "Received in China",
    publicLocation: "China warehouse",
    description: "Registered, packed and staged for the airport.",
    tone: "muted",
    owner: "China Warehouse",
  },
  IN_TRANSIT: {
    label: "In transit",
    publicLabel: "In transit",
    publicLocation: "China → Tanzania",
    description: "Departed China on a confirmed flight.",
    tone: "info",
    owner: "China Warehouse",
  },
  RECEIVED_AT_DAR: {
    label: "Received at Dar warehouse",
    publicLabel: "Arrived in Tanzania",
    publicLocation: "Dar es Salaam warehouse",
    description: "Landed and checked in against the batch manifest.",
    tone: "warning",
    owner: "Dar Warehouse",
  },
  READY_FOR_PICKUP: {
    label: "Ready for pickup",
    publicLabel: "Ready for pickup",
    publicLocation: "Dar es Salaam warehouse",
    description: "Payment confirmed. Pickup note issued.",
    tone: "brand",
    owner: "Finance",
  },
  DELIVERED: {
    label: "Delivered",
    publicLabel: "Delivered",
    publicLocation: "Collected by customer",
    description: "Released to the customer against a valid pickup note.",
    tone: "success",
    owner: "Dar Warehouse",
  },
  CANCELLED: {
    label: "Cancelled",
    publicLabel: "Cancelled",
    publicLocation: "—",
    description: "Voided by management. No longer in the operational flow.",
    tone: "destructive",
    owner: "CEO / Admin",
  },
};

/** The happy path, in order. Used for progress bars and timelines. */
export const SHIPMENT_FLOW: ShipmentStatus[] = [
  "READY_TO_DEPART",
  "IN_TRANSIT",
  "RECEIVED_AT_DAR",
  "READY_FOR_PICKUP",
  "DELIVERED",
];

export const BATCH_STATUS_META: Record<
  BatchStatus,
  { label: string; tone: StatusMeta["tone"] }
> = {
  OPEN: { label: "Open — loading", tone: "muted" },
  READY_TO_DEPART: { label: "Sealed — ready to depart", tone: "warning" },
  IN_TRANSIT: { label: "In transit", tone: "info" },
  ARRIVED: { label: "Arrived — awaiting check", tone: "warning" },
  VERIFIED: { label: "Verified", tone: "success" },
  CLOSED: { label: "Closed", tone: "muted" },
};

// ---------------------------------------------------------------------------
// Dropdown option lists
// ---------------------------------------------------------------------------

export const ORIGIN_LABELS: Record<Origin, string> = {
  GUANGZHOU: "Guangzhou",
  HONG_KONG: "Hong Kong",
};

export const GOODS_TYPE_LABELS: Record<GoodsType, string> = {
  GENERAL_MERCHANDISE: "General merchandise",
  ELECTRONICS: "Electronics",
  PHONE_ACCESSORIES: "Phone accessories",
  TEXTILES_GARMENTS: "Textiles & garments",
  FOOTWEAR: "Footwear",
  COSMETICS: "Cosmetics",
  MACHINERY_PARTS: "Machinery parts",
  AUTO_SPARES: "Auto spares",
  FURNITURE_FITTINGS: "Furniture & fittings",
  MEDICAL_SUPPLIES: "Medical supplies",
  STATIONERY: "Stationery",
  OTHER: "Other",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  MOBILE_MONEY: "Mobile money",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
};

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  MISSING_SHIPMENT: "Missing shipment",
  DAMAGED_CARGO: "Damaged cargo",
  WEIGHT_MISMATCH: "Weight mismatch",
  PACKAGE_COUNT_MISMATCH: "Package count mismatch",
  WRONG_BATCH: "Wrong batch",
  OTHER: "Other",
};

/** Common airlines on the China → Tanzania corridor, offered as suggestions. */
export const AIRLINE_SUGGESTIONS = [
  "Ethiopian Airlines",
  "Emirates SkyCargo",
  "Qatar Airways Cargo",
  "Kenya Airways Cargo",
  "Turkish Cargo",
  "China Southern Cargo",
  "Air Tanzania",
] as const;

/** Cargo descriptions the China desk reuses constantly. */
export const DESCRIPTION_SUGGESTIONS = [
  "Assorted general goods",
  "Mobile phone accessories",
  "Ladies' clothing",
  "Men's clothing",
  "Shoes / sneakers",
  "Human hair & beauty products",
  "Kitchenware",
  "Motorcycle spare parts",
  "LED lighting",
  "Solar equipment",
] as const;

export const TZ_CITIES = [
  "Dar es Salaam",
  "Arusha",
  "Mwanza",
  "Dodoma",
  "Mbeya",
  "Morogoro",
  "Tanga",
  "Zanzibar",
  "Moshi",
  "Iringa",
] as const;

export function enumOptions<T extends string>(
  labels: Record<T, string>
): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: labels[value],
  }));
}
