/**
 * Shared facts about expenses, importable from both server actions and pages.
 *
 * Kept out of lib/actions/expenses.ts because a "use server" module may only
 * export async functions — a constant exported from one fails at build, and it
 * fails in a way that names the wrong file.
 */

/**
 * Above this, a cost needs the CEO's signature before it can leave an account.
 *
 * A constant rather than a setting, for now: the alternative is a configuration
 * screen nobody has asked for, guarding a threshold nobody has disagreed with.
 *
 * There is a threshold at all because a five-person company that must route a
 * TZS 5,000 taxi fare through an approval queue stops using the system by
 * Thursday — and then nothing is recorded, which is far worse than a small cost
 * being recorded without a second signature. Small costs are recorded and paid
 * in one action; large ones are the ones worth stopping for.
 */

export const EXPENSE_CATEGORIES = [
  "AIR_FREIGHT",
  "CUSTOMS_DUTY",
  "CLEARING_AGENT",
  "LOCAL_TRANSPORT",
  "PORT_CHARGES",
  "PERMITS",
  "WAREHOUSE_RENT",
  "SALARIES",
  "UTILITIES",
  "COMMUNICATION",
  "BANK_CHARGES",
  "OFFICE_SUPPLIES",
  "MARKETING",
  "TRAVEL",
  "PROFESSIONAL_FEES",
  "EQUIPMENT",
  "REPAIRS",
  "CUSTOMER_COMPENSATION",
  "TAX",
  "FUEL",
  "CLEANING",
  "INTERNET",
  "ELECTRICITY",
  "WATER",
  "ALLOWANCE",
  "STAFF_WELFARE",
  "TRAINING",
  "TRANSFER_FEES",
  "EXCHANGE_LOSS",
  "OTHER",
] as const;

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  AIR_FREIGHT: "Freight",
  CUSTOMS_DUTY: "Customs",
  CLEARING_AGENT: "Clearing charges",
  LOCAL_TRANSPORT: "Transport",
  PORT_CHARGES: "Port charges",
  PERMITS: "Special permit",
  WAREHOUSE_RENT: "Rent",
  SALARIES: "Salary",
  UTILITIES: "Utilities",
  COMMUNICATION: "Communication",
  BANK_CHARGES: "Bank charges",
  OFFICE_SUPPLIES: "Office supplies",
  MARKETING: "Marketing",
  TRAVEL: "Travel",
  PROFESSIONAL_FEES: "Professional fees",
  EQUIPMENT: "Equipment",
  REPAIRS: "Maintenance",
  CUSTOMER_COMPENSATION: "Customer compensation",
  TAX: "Tax",
  FUEL: "Fuel",
  CLEANING: "Cleaning",
  INTERNET: "Internet",
  ELECTRICITY: "Electricity",
  WATER: "Water",
  ALLOWANCE: "Allowance",
  STAFF_WELFARE: "Staff welfare",
  TRAINING: "Training",
  TRANSFER_FEES: "Transfer fees",
  EXCHANGE_LOSS: "Exchange loss",
  OTHER: "Miscellaneous",
};

/**
 * The categories, in the five groups the business actually thinks in.
 *
 * Thirty categories in one flat dropdown is a list nobody reads to the end:
 * the same cost gets filed three ways by three people, and the report is then
 * wrong in a way no total will reveal. Grouped, the choice is "which part of
 * the business is this" and then one of five or six — and the groups are the
 * headings a profit and loss wants anyway.
 *
 * Presentation only. The stored value is still the enum, so nothing already
 * recorded moves and no report has to be rewritten.
 */
export const EXPENSE_CATEGORY_GROUPS: {
  key: string;
  label: string;
  hint: string;
  categories: string[];
}[] = [
  {
    key: "batch",
    label: "Batch operations",
    hint: "Moving the cargo. These are what per-batch profit is made of.",
    categories: [
      "CUSTOMS_DUTY",
      "AIR_FREIGHT",
      "LOCAL_TRANSPORT",
      "PORT_CHARGES",
      "PERMITS",
      "CLEARING_AGENT",
    ],
  },
  {
    key: "office",
    label: "Office operations",
    hint: "Keeping the business open. Belongs to no single batch.",
    categories: [
      "WAREHOUSE_RENT",
      "INTERNET",
      "ELECTRICITY",
      "WATER",
      "OFFICE_SUPPLIES",
      "REPAIRS",
      "FUEL",
      "CLEANING",
      "EQUIPMENT",
      "COMMUNICATION",
      "UTILITIES",
    ],
  },
  {
    key: "staff",
    label: "Staff",
    hint: "What the people cost.",
    categories: ["SALARIES", "ALLOWANCE", "STAFF_WELFARE", "TRAINING"],
  },
  {
    key: "financial",
    label: "Financial",
    hint: "The cost of moving and holding the money itself.",
    categories: ["BANK_CHARGES", "TRANSFER_FEES", "EXCHANGE_LOSS"],
  },
  {
    key: "other",
    label: "Other",
    hint: "Anything that genuinely fits nowhere above.",
    categories: [
      "OTHER",
      "MARKETING",
      "TRAVEL",
      "PROFESSIONAL_FEES",
      "CUSTOMER_COMPENSATION",
      "TAX",
    ],
  },
];

/** Which group a category belongs to — for reporting under headings. */
export const CATEGORY_GROUP_OF: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORY_GROUPS.flatMap((g) => g.categories.map((c) => [c, g.label]))
);

export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Not paid",
  APPROVED: "Approved",
  PAID: "Paid",
  VOID: "Cancelled",
};

/**
 * The costs this business actually incurs, week in week out.
 *
 * Recording a cost was four fields every time, including retyping "Fuel" and
 * choosing its category from eighteen. These are the ones an air-cargo
 * operation between Guangzhou and Dar pays over and over, so they are one tap:
 * the description and the category are filled together, which is also what
 * stops the same cost being filed under three different categories by three
 * different people.
 *
 * Seeds, not a fixed list. The form shows what has actually been recorded most
 * often ahead of these, so the shortcuts become the business's own within a
 * few weeks. Anything not here is still typed freely — this removes keystrokes,
 * it does not constrain what can be recorded.
 */
export const COMMON_EXPENSES: { label: string; category: string }[] = [
  { label: "Customs", category: "CUSTOMS_DUTY" },
  { label: "Freight", category: "AIR_FREIGHT" },
  { label: "Port charges", category: "PORT_CHARGES" },
  { label: "Transport", category: "LOCAL_TRANSPORT" },
  { label: "Clearing charges", category: "CLEARING_AGENT" },
  { label: "Special permit", category: "PERMITS" },
  { label: "Fuel", category: "FUEL" },
  { label: "Office rent", category: "WAREHOUSE_RENT" },
  { label: "Internet", category: "INTERNET" },
  { label: "Electricity", category: "ELECTRICITY" },
  { label: "Water", category: "WATER" },
  { label: "Office supplies", category: "OFFICE_SUPPLIES" },
  { label: "Maintenance", category: "REPAIRS" },
  { label: "Cleaning", category: "CLEANING" },
  { label: "Staff welfare", category: "STAFF_WELFARE" },
  { label: "Salary", category: "SALARIES" },
  { label: "Allowance", category: "ALLOWANCE" },
  { label: "Petty cash reimbursement", category: "OTHER" },
  { label: "Bank charges", category: "BANK_CHARGES" },
  { label: "Other", category: "OTHER" },
];

/**
 * The templates, grouped the way the form shows them.
 *
 * The same list as above, arranged so the row of one-tap picks is scannable
 * rather than twenty chips in a heap. A template fills the description AND the
 * category together, which is the half of it that matters: it is not the
 * typing that costs the business, it is the same cost being filed under three
 * different categories by three different people, which makes every report
 * quietly wrong.
 *
 * Everything stays editable after a tap. This removes keystrokes; it does not
 * constrain what can be recorded.
 */
export const EXPENSE_TEMPLATE_GROUPS: {
  label: string;
  items: { label: string; category: string }[];
}[] = [
  {
    label: "Batch",
    items: [
      { label: "Customs", category: "CUSTOMS_DUTY" },
      { label: "Freight", category: "AIR_FREIGHT" },
      { label: "Port charges", category: "PORT_CHARGES" },
      { label: "Transport", category: "LOCAL_TRANSPORT" },
      { label: "Clearing charges", category: "CLEARING_AGENT" },
      { label: "Special permit", category: "PERMITS" },
    ],
  },
  {
    label: "Office",
    items: [
      { label: "Office rent", category: "WAREHOUSE_RENT" },
      { label: "Internet", category: "INTERNET" },
      { label: "Electricity", category: "ELECTRICITY" },
      { label: "Water", category: "WATER" },
      { label: "Fuel", category: "FUEL" },
      { label: "Office supplies", category: "OFFICE_SUPPLIES" },
      { label: "Maintenance", category: "REPAIRS" },
      { label: "Cleaning", category: "CLEANING" },
    ],
  },
  {
    label: "Staff & money",
    items: [
      { label: "Salary", category: "SALARIES" },
      { label: "Allowance", category: "ALLOWANCE" },
      { label: "Staff welfare", category: "STAFF_WELFARE" },
      { label: "Petty cash reimbursement", category: "OTHER" },
      { label: "Bank charges", category: "BANK_CHARGES" },
      { label: "Other", category: "OTHER" },
    ],
  },
];

/**
 * Whether a cost counts towards the figure the business is judged on.
 *
 * Operating is everything it takes to fly cargo and keep the office open.
 * Non-operating is money that genuinely left the company but that would
 * mislead if mixed in — it makes a good month look bad and a profitable
 * flight look like a loss. Both are recorded, both move the cash position,
 * both appear in the ledger; only one is allowed into operating and per-batch
 * profit.
 */
export const EXPENSE_CLASSES = ["OPERATING", "NON_OPERATING"] as const;

export const EXPENSE_CLASS_LABELS: Record<
  (typeof EXPENSE_CLASSES)[number],
  string
> = {
  OPERATING: "Operating",
  NON_OPERATING: "Special",
};

/**
 * The longer sentence under each option on the form, so whoever is recording a
 * cost picks the right one without being told twice.
 */
export const EXPENSE_CLASS_HINTS: Record<
  (typeof EXPENSE_CLASSES)[number],
  string
> = {
  OPERATING: "Counts towards profit — running the business and flying cargo.",
  NON_OPERATING:
    "Recorded and paid, but kept out of operating and batch profit so it cannot distort them.",
};

/**
 * The costs that happen on almost every dispatch, in the order they happen.
 *
 * A flight lands and then always incurs roughly the same six things: it is
 * cleared at Zanzibar or at Dar, it may need a permit at either, it is trucked
 * from Zanzibar to Dar, and it is trucked from the port to the warehouse.
 *
 * Presenting those as a generic form with a category dropdown of eighteen makes
 * somebody pick the same category several times a week for a cost whose
 * category never changes. So they are a checklist instead: the six are always
 * listed, each either carrying its figure or waiting for one, and anything
 * unusual is added underneath.
 *
 * The list being always visible is the point. A blank row is a reminder that
 * the clearing agent has not been paid yet; a blank form can never be that.
 */
export const BATCH_COST_TYPES = [
  { key: "zanzibar-customs", label: "Zanzibar customs", category: "CUSTOMS_DUTY" },
  { key: "zanzibar-permit", label: "Zanzibar special permit", category: "PERMITS" },
  {
    key: "zanzibar-dar-transport",
    label: "Transport · Zanzibar to Dar",
    category: "LOCAL_TRANSPORT",
  },
  { key: "dar-customs", label: "Dar es Salaam customs", category: "CUSTOMS_DUTY" },
  { key: "dar-permit", label: "Dar es Salaam special permit", category: "PERMITS" },
  {
    key: "port-warehouse-transport",
    label: "Transport · Dar port to warehouse",
    category: "LOCAL_TRANSPORT",
  },
] as const;

export type BatchCostType = (typeof BATCH_COST_TYPES)[number];
