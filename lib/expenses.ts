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
export const EXPENSE_APPROVAL_THRESHOLD_USD = 500;

export const EXPENSE_CATEGORIES = [
  "AIR_FREIGHT",
  "CUSTOMS_DUTY",
  "CLEARING_AGENT",
  "LOCAL_TRANSPORT",
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
  "OTHER",
] as const;

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  AIR_FREIGHT: "Air freight",
  CUSTOMS_DUTY: "Customs duty",
  CLEARING_AGENT: "Clearing agent",
  LOCAL_TRANSPORT: "Local transport",
  WAREHOUSE_RENT: "Warehouse rent",
  SALARIES: "Salaries",
  UTILITIES: "Utilities",
  COMMUNICATION: "Communication",
  BANK_CHARGES: "Bank charges",
  OFFICE_SUPPLIES: "Office supplies",
  MARKETING: "Marketing",
  TRAVEL: "Travel",
  PROFESSIONAL_FEES: "Professional fees",
  EQUIPMENT: "Equipment",
  REPAIRS: "Repairs",
  CUSTOMER_COMPENSATION: "Customer compensation",
  TAX: "Tax",
  OTHER: "Other",
};

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
  { label: "Fuel", category: "LOCAL_TRANSPORT" },
  { label: "Customs duty", category: "CUSTOMS_DUTY" },
  { label: "Clearing agent", category: "CLEARING_AGENT" },
  { label: "Delivery to customer", category: "LOCAL_TRANSPORT" },
  { label: "Airline freight charge", category: "AIR_FREIGHT" },
  { label: "Warehouse rent", category: "WAREHOUSE_RENT" },
  { label: "Salaries", category: "SALARIES" },
  { label: "Electricity", category: "UTILITIES" },
  { label: "Water", category: "UTILITIES" },
  { label: "Airtime & internet", category: "COMMUNICATION" },
  { label: "Bank charges", category: "BANK_CHARGES" },
  { label: "Packaging materials", category: "OFFICE_SUPPLIES" },
  { label: "Office supplies", category: "OFFICE_SUPPLIES" },
  { label: "Vehicle repair", category: "REPAIRS" },
];
