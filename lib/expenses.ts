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
