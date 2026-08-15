import type {
  BatchStatus,
  DamageSeverity,
  Department,
  ExceptionStatus,
  ExceptionType,
  GoodsType,
  InvoiceStatus,
  Origin,
  PaymentMethod,
  ResolutionType,
  Role,
  ShipmentStatus,
} from "@prisma/client";

import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

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

  /**
   * The Tanzanian collection point. ONE office, not two.
   *
   * This was listed as an "Aggrey office" and a separate "Ndanda office",
   * which put two addresses on the public site, in the footer, on the contact
   * page and in customer messages — and sent people to a second building that
   * does not exist. It is one office on the corner of both streets. The owner
   * gave this wording; it is theirs, not a tidied version of it.
   */
  offices: [
    {
      id: "kariakoo",
      city: "Dar es Salaam",
      name: "Dar es Salaam office",
      address:
        "Kariakoo, Agrey & Ndanda Street Opposite na Mkombozi Bank Dar es Salaam, Tanzania",
      /**
       * The same address broken where a person would break it.
       *
       * One long string is right for a footer and wrong for a WhatsApp
       * message, where it wraps mid-street-name and a customer trying to find
       * the place reads a paragraph instead of an address. Splitting the
       * single string on commas at render time would be guesswork; these are
       * the breaks the owner wrote.
       */
      lines: [
        "Kariakoo, Agrey & Ndanda Street,",
        "Opposite Mkombozi Bank,",
        "Dar es Salaam, Tanzania.",
      ],
      country: "TANZANIA",
      flag: "🇹🇿",
      note: "Collection point.",
      phones: ["+255 688 887 784", "+255 628 430 911"],
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
    lines: [
      "ECAT Cultural Park,",
      "Huanzhou 3rd Road, Jinshazhou,",
      "Baiyun District, Guangzhou, China.",
    ],
    country: "CHINA",
    flag: "🇨🇳",
    phones: ["+86 191 2866 4885", "+86 131 6834 2573", "+86 136 9970 9572"],
  },

  // Kept for printed documents, which need one short line per location.
  darAddress:
    "Kariakoo, Agrey & Ndanda Street Opposite na Mkombozi Bank Dar es Salaam, Tanzania",
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
export type CollectionAccount = {
  /**
   * How the customer is told to pay, in full.
   *
   * "MIX BY YAS — LIPA NUMBER", never "Mixx". A customer reading "Mixx: 7122055"
   * has to guess whether that is a Lipa number, a personal number or an
   * account, and a guess at this step is money sent to the wrong place. The
   * label states the service, what kind of number it is, and — for banks — the
   * currency, because paying dollars into the shilling account is a reversal
   * and a fortnight of somebody's time.
   */
  label: string;
  number: string;
  /** What the customer must see on their screen before they confirm. */
  accountName: string;
  kind: "MOBILE" | "BANK";
  /** Banks only. Mobile money is shillings by definition here. */
  currency?: "TZS" | "USD";
};

/**
 * Official collection accounts. THE single source for every surface.
 *
 * Kept in code rather than the database because an invoice is a legal
 * document: the account a customer paid into must be reproducible from the
 * code that generated that invoice, not from a table someone edited
 * afterwards.
 *
 * Nothing anywhere may write these numbers out again. Every customer-facing
 * screen, PDF, WhatsApp message and email reads this list, so changing a
 * number here changes it everywhere at once — which is the only way five
 * surfaces can be guaranteed to agree.
 */
export const PAYMENT_METHODS: readonly CollectionAccount[] = [
  {
    label: "MIX BY YAS — LIPA NUMBER",
    number: "7122055",
    accountName: "SCOHU TARGET EXPRESS AIR CARGO",
    kind: "MOBILE",
  },
  {
    label: "VODACOM M-PESA — LIPA NUMBER",
    number: "5581590",
    accountName: "TARGET EXPRESS AIR CARGO",
    kind: "MOBILE",
  },
  {
    label: "CRDB BANK — TZS ACCOUNT",
    number: "0150597916300",
    accountName: "TARGET(GZ) EXPRESS AIR CARGO",
    kind: "BANK",
    currency: "TZS",
  },
  {
    label: "TANZANIA COMMERCIAL BANK — TZS ACCOUNT",
    number: "121400000029",
    accountName: "TARGET EXPRESS AIR CARGO",
    kind: "BANK",
    currency: "TZS",
  },
  {
    label: "TANZANIA COMMERCIAL BANK — USD ACCOUNT",
    number: "121223000019",
    accountName: "TARGET EXPRESS AIR CARGO",
    kind: "BANK",
    currency: "USD",
  },
];

/**
 * The old grouped shape, DERIVED so it cannot drift.
 *
 * The invoice page and the PDF read it. Rather than edit three renderers at
 * once and risk one of them keeping a stale copy, the shape stays and the data
 * behind it moves — there is still exactly one place a number is written down.
 */
export const PAYMENT_ACCOUNTS = {
  mobileMoney: PAYMENT_METHODS.filter((m) => m.kind === "MOBILE").map((m) => ({
    provider: m.label,
    number: m.number,
    accountName: m.accountName,
  })),
  banks: Array.from(
    PAYMENT_METHODS.filter((m) => m.kind === "BANK").reduce((byName, m) => {
      // "CRDB BANK — TZS ACCOUNT" groups under "CRDB BANK".
      const bank = m.label.split(" — ")[0]!;
      const existing = byName.get(bank) ?? {
        bank,
        accountName: m.accountName,
        accounts: [] as { currency: string; number: string }[],
      };
      existing.accounts.push({ currency: m.currency ?? "TZS", number: m.number });
      byName.set(bank, existing);
      return byName;
    }, new Map<string, { bank: string; accountName: string; accounts: { currency: string; number: string }[] }>())
  ).map(([, value]) => value),
};

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

/**
 * e.g. "3 cartons", "1 piece". A count is never shown without its unit.
 *
 * The number stays outside the translation and the unit goes through it —
 * "3 纸箱" reads the same way round in both languages, and a dictionary keyed
 * by the finished sentence could never match a string carrying a count.
 */
export function formatPackages(count: number, type: string, locale: Locale = "en") {
  const label = PACKAGE_TYPE_LABELS[type] ?? PACKAGE_TYPE_LABELS.OTHER;
  return `${count} ${t(locale, count === 1 ? label.one : label.many)}`;
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

export function formatPackagesShort(
  count: number,
  type: string,
  locale: Locale = "en"
) {
  return `${count} ${t(locale, PACKAGE_TYPE_SHORT[type] ?? PACKAGE_TYPE_SHORT.OTHER)}`;
}

/**
 * Invoice statuses that represent a real demand for money.
 *
 * A DRAFT is the system's working figure: nobody has reviewed it, the customer
 * has never seen it, and no one owes it. Every revenue total, follow-up queue and
 * customer-facing surface asks this question, so they all answer it the same
 * way — and a status added later is picked up everywhere at once.
 */
export const BILLED_INVOICE_STATUSES = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
] as const satisfies readonly InvoiceStatus[];

export const STORAGE_POLICY = {
  freeDays: 7,
  perDayUsd: 2,
  currency: "USD",
  text: [
    "Storage is FREE for 7 days only.",
    "After 7 days, storage charges of USD 2 per day will apply for all cargo remaining in the warehouse.",
    "Customers are advised to collect their cargo on time to avoid additional storage charges.",
    "Thank you for choosing Target Express Air Cargo.",
  ],
} as const;

/**
 * The storage terms in the reader's language, for an invoice or a pickup note.
 *
 * The English stays in `STORAGE_POLICY.text` because that is what the keys are;
 * this renders those same four lines for whoever is holding the document.
 */
export function storagePolicyText(locale: Locale = "en"): string[] {
  return STORAGE_POLICY.text.map((line) => t(locale, line));
}

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
  UNDER_INVESTIGATION: {
    label: "Under investigation",
    publicLabel: "Under investigation",
    publicLocation: "Dar es Salaam",
    // Said to the customer without alarming them and without promising a
    // recovery nobody has made yet.
    description: "Reported missing or unlocatable. Being searched for.",
    tone: "warning",
    owner: "Dar warehouse",
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
  MISSING_SHIPMENT: "Missing cargo",
  DAMAGED_CARGO: "Damaged cargo",
  WEIGHT_MISMATCH: "Weight mismatch",
  PACKAGE_COUNT_MISMATCH: "Package count mismatch",
  WRONG_BATCH: "Wrong batch",
  WRONG_ITEM: "Wrong item",
  HOLD_FOR_INVESTIGATION: "Hold for investigation",
  OTHER: "Other",
};

/**
 * Two states, whatever the column holds.
 *
 * The owner's rule: a case is being worked, or it is finished. The enum still
 * carries the older values because rows exist with them and rewriting history
 * to tidy a label is not a trade worth making — but nothing new is written to
 * them, and none of them earns its own word on screen. A queue that
 * distinguishes "open" from "under investigation" is asking the floor to
 * maintain a distinction that changes nothing about the cargo.
 */
export const EXCEPTION_STATUS_LABELS: Record<ExceptionStatus, string> = {
  OPEN: "Under investigation",
  UNDER_INVESTIGATION: "Under investigation",
  WAITING_CUSTOMER: "Under investigation",
  COMPENSATION_APPROVED: "Under investigation",
  REPLACEMENT_APPROVED: "Under investigation",
  CARGO_FOUND: "Resolved",
  CLOSED: "Resolved",
  RESOLVED: "Resolved",
  WRITTEN_OFF: "Resolved",
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

/**
 * What happened, in the words the desk uses.
 *
 * Cargo Found is the only outcome whose note is optional — "we found it" is a
 * complete answer. Every other outcome closes a case that cost somebody
 * something, and those must say how it was settled.
 */
export const RESOLUTION_TYPE_LABELS: Record<ResolutionType, string> = {
  CARGO_FOUND: "Cargo found",
  WEIGHT_CORRECTED: "Weight corrected",
  DAMAGE_SETTLED: "Damaged cargo settled",
  CARGO_LOST: "Cargo lost",
  OTHER: "Other",
};

/** Outcomes that cannot be filed without an explanation. */
export const RESOLUTION_NOTE_REQUIRED: readonly ResolutionType[] = [
  "WEIGHT_CORRECTED",
  "DAMAGE_SETTLED",
  "CARGO_LOST",
  "OTHER",
];

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

/**
 * A label map as dropdown options, in the reader's language.
 *
 * The value is the enum and never moves; only the label is translated, so a
 * Chinese desk picking "手机配件" still submits PHONE_ACCESSORIES.
 */
export function enumOptions<T extends string>(
  labels: Record<T, string>,
  locale: Locale = "en"
): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: t(locale, labels[value]),
  }));
}
