import type {
  BatchStatus,
  DamageSeverity,
  Department,
  ExceptionStatus,
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

  /**
   * The promise the business is built on: 3-10 days, door to door.
   *
   * It said "three days" until the hero copy was rewritten to 3-10. Leaving
   * this alone would have put a three-day promise in the footer of the same
   * page whose headline says 3-10 — a contradiction a customer reads as either
   * carelessness or a bait price.
   */
  promiseSw: "Ndani ya siku 3-10, mzigo wako kutoka China unafika Tanzania.",
  promiseEn: "Your cargo reaches Tanzania in 3-10 days.",
  /** The same figure on its own, for stat tiles. */
  promiseDays: "3-10",
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

/** Rates are published in USD, so invoices are raised in USD. */
export const DEFAULT_CURRENCY = "USD";

/**
 * Official collection accounts, printed on every invoice.
 *
 * Kept here rather than in the database because an invoice is a legal document:
 * the account a customer paid into must be reproducible from the code that
 * generated that invoice, not from a table someone edited afterwards.
 */
export const PAYMENT_ACCOUNTS = {
  mobileMoney: [
    {
      provider: "Mixx by Yas",
      number: "7122055",
      accountName: "SCOHU TARGET EXPRESS AIR CARGO",
    },
    {
      provider: "Vodacom (M-Pesa)",
      number: "5581590",
      accountName: "TARGET EXPRESS AIR CARGO",
    },
  ],
  banks: [
    {
      bank: "CRDB Bank",
      accountName: "TARGET(GZ) EXPRESS AIR CARGO",
      accounts: [{ currency: "TZS", number: "0150597916300" }],
    },
    {
      bank: "Tanzania Commercial Bank",
      accountName: "TARGET EXPRESS AIR CARGO",
      accounts: [
        { currency: "TZS", number: "121400000029" },
        { currency: "USD", number: "121223000019" },
      ],
    },
  ],
} as const;

/**
 * Storage terms. Free for a week from arrival in Dar, then chargeable per day
 * per shipment — which is what stops the warehouse becoming free long-term
 * storage.
 */
/**
 * How cargo is counted, in the words that go on a manifest.
 *
 * "3 packages" and "20 pieces" describe different pallets. Forcing everything
 * into one unit makes the manifest disagree with what is physically there,
 * which is the document a customs officer reads.
 */
export const PACKAGE_TYPE_LABELS: Record<string, { one: string; many: string }> = {
  CARTON: { one: "carton", many: "cartons" },
  PIECE: { one: "piece", many: "pieces" },
  PACKAGE: { one: "package", many: "packages" },
  BAG: { one: "bag", many: "bags" },
  BOX: { one: "box", many: "boxes" },
  ENVELOPE: { one: "envelope", many: "envelopes" },
  OTHER: { one: "package", many: "packages" },
};

/** e.g. "3 cartons", "1 piece". A count is never shown without its unit. */
export function formatPackages(count: number, type: string) {
  const label = PACKAGE_TYPE_LABELS[type] ?? PACKAGE_TYPE_LABELS.OTHER;
  return `${count} ${count === 1 ? label.one : label.many}`;
}

/** Short form for dense columns: "3 ctn", "20 pcs". Still never a bare number. */
export const PACKAGE_TYPE_SHORT: Record<string, string> = {
  CARTON: "ctn",
  PIECE: "pcs",
  PACKAGE: "pkg",
  BAG: "bag",
  BOX: "box",
  ENVELOPE: "env",
  OTHER: "unit",
};

export function formatPackagesShort(count: number, type: string) {
  return `${count} ${PACKAGE_TYPE_SHORT[type] ?? PACKAGE_TYPE_SHORT.OTHER}`;
}

export const STORAGE_POLICY = {
  freeDays: 7,
  perDayUsd: 2,
  currency: "USD",
  text: [
    "Storage is FREE for 7 days only.",
    "After 7 days, storage charges of USD 2 per day will apply for every shipment remaining in the warehouse.",
    "Customers are advised to collect their cargo on time to avoid additional storage charges.",
    "Thank you for choosing Target Express Air Cargo.",
  ],
} as const;

/**
 * Chargeable storage days for a shipment sitting in the Dar warehouse.
 *
 * Counts from arrival, not from invoicing, and stops counting once the cargo
 * leaves — a delivered shipment cannot keep accruing storage.
 */
export function storageDaysFor(
  arrivedAt: Date | null,
  deliveredAt: Date | null,
  now: Date = new Date()
): number {
  if (!arrivedAt) return 0;
  const end = deliveredAt ?? now;
  const days = Math.floor((end.getTime() - arrivedAt.getTime()) / 86_400_000);
  return Math.max(0, days - STORAGE_POLICY.freeDays);
}

// ---------------------------------------------------------------------------
// Roles & departments
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "CEO / Admin",
  CHINA_WAREHOUSE: "China Warehouse",
  DAR_WAREHOUSE: "Dar Warehouse",
  FINANCE: "Finance",
  CUSTOMER_CARE: "Customer Care",
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  MANAGEMENT: "Management",
  CHINA_WAREHOUSE: "China Warehouse",
  DAR_WAREHOUSE: "Dar es Salaam Warehouse",
  FINANCE: "Finance",
  CUSTOMER_CARE: "Customer Care",
};

/** The department a role belongs to by default when an admin creates a user. */
export const ROLE_DEFAULT_DEPARTMENT: Record<Role, Department> = {
  ADMIN: "MANAGEMENT",
  CHINA_WAREHOUSE: "CHINA_WAREHOUSE",
  DAR_WAREHOUSE: "DAR_WAREHOUSE",
  FINANCE: "FINANCE",
  CUSTOMER_CARE: "CUSTOMER_CARE",
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
  // Named READY_TO_DEPART in the database for historical reasons, but the words
  // shown to staff say where the cargo actually is. "Ready to depart" was wrong
  // twice over: the cargo is not going anywhere until its batch is sealed, and
  // the batch has its own status of the same name meaning something else.
  READY_TO_DEPART: {
    label: "Waiting for next flight",
    publicLabel: "Received in China",
    publicLocation: "China warehouse",
    description:
      "Registered and labelled in China, waiting for the next flight out.",
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
  // A full batch is closed to new cargo but has not been sealed for the flight
  // yet — the next shipment for its route opens a fresh batch automatically.
  FULL: { label: "Full — no more cargo", tone: "warning" },
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
  WRONG_ITEM: "Wrong item",
  HOLD_FOR_INVESTIGATION: "Hold for investigation",
  OTHER: "Other",
};

export const EXCEPTION_STATUS_LABELS: Record<ExceptionStatus, string> = {
  OPEN: "Open",
  UNDER_INVESTIGATION: "Under investigation",
  WAITING_CUSTOMER: "Waiting for customer decision",
  COMPENSATION_APPROVED: "Compensation approved",
  REPLACEMENT_APPROVED: "Replacement approved",
  CARGO_FOUND: "Cargo found",
  CLOSED: "Closed",
  RESOLVED: "Resolved",
  WRITTEN_OFF: "Written off",
};

/**
 * A case nobody has finished with. The queue, the dashboard counts and the
 * public "Under Investigation" line all key off this one list, so a new
 * lifecycle value is live everywhere the moment it is added here.
 */
export const EXCEPTION_OPEN_STATUSES = [
  "OPEN",
  "UNDER_INVESTIGATION",
  "WAITING_CUSTOMER",
  "COMPENSATION_APPROVED",
  "REPLACEMENT_APPROVED",
] as const satisfies readonly ExceptionStatus[];

/**
 * Finished. CARGO_FOUND is terminal because the box is back on the shelf and
 * the cargo returns to its normal operational status; RESOLVED and WRITTEN_OFF
 * are the pre-lifecycle values, kept so old rows still read correctly and never
 * written by new code.
 */
export const EXCEPTION_TERMINAL_STATUSES = [
  "CARGO_FOUND",
  "CLOSED",
  "RESOLVED",
  "WRITTEN_OFF",
] as const satisfies readonly ExceptionStatus[];

/**
 * Statuses that mean the cargo must not be handed over, whatever the shipment
 * record says. The pickup counter and the public tracking page both ask this
 * question, and they must never disagree — the owner's rule is that a customer
 * never sees "Ready for Pickup" for cargo that is missing or unavailable.
 */
export function blocksPickup(status: ExceptionStatus) {
  return (EXCEPTION_OPEN_STATUSES as readonly ExceptionStatus[]).includes(status);
}

export const DAMAGE_SEVERITY_LABELS: Record<DamageSeverity, string> = {
  MINOR: "Minor",
  MODERATE: "Moderate",
  SEVERE: "Severe",
  TOTAL_LOSS: "Total loss",
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
