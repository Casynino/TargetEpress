/**
 * WHO DOES WHAT: the owner oversees, the manager supervises, the departments work.
 *
 *   npx tsx scripts/check-role-duties.mts
 *
 * The owner's rule of 5 Nov 2026, held as a table so a later edit to
 * lib/rbac.ts cannot quietly hand a department's daily work back to the two
 * chairs that supervise it — or take a department's own work away from it.
 * Pure: it reads the permission table, nothing else.
 */
import { can, linkFor, type Permission } from "@/lib/rbac";

let fails = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}${!ok && detail ? `  — ${detail}` : ""}`);
};
const missing = (role: Parameters<typeof can>[0], keys: Permission[]) => keys.filter((k) => !can(role, k));
const held = (role: Parameters<typeof can>[0], keys: Permission[]) => keys.filter((k) => can(role, k));

/* Each department's daily work, and the desk it belongs to. */
const WORK: Record<string, { role: Parameters<typeof can>[0]; keys: Permission[] }> = {
  "China warehouse": { role: "CHINA_WAREHOUSE", keys: ["shipment.create", "label.print", "batch.create", "batch.manage", "shipment.depart", "exception.foundInChina"] },
  "Dar warehouse": { role: "DAR_WAREHOUSE", keys: ["batch.receive", "batch.verify", "shipment.scan", "shipment.release", "exception.resolve"] },
  Finance: { role: "FINANCE", keys: ["invoice.manage", "invoice.edit", "invoice.send", "invoice.priceConfirm", "payment.record", "payment.verify", "pickupNote.issue", "pickupNote.cancel", "expense.record", "treasury.move", "loan.record", "payroll.prepare", "batch.close", "exception.compensate"] },
  "Customer Support": { role: "CUSTOMER_CARE", keys: ["ticket.manage", "sourcing.manage", "message.send", "customer.manage", "customer.merge", "credit.request", "payment.submit"] },
};

console.log("Each department keeps its own work");
for (const [desk, { role, keys }] of Object.entries(WORK)) {
  const gone = missing(role, keys);
  check(`${desk} still holds its daily work`, gone.length === 0, gone.join(", "));
}

console.log("\nThe owner and the manager do none of it");
const allWork = Object.values(WORK).flatMap((w) => w.keys);
for (const role of ["ADMIN", "MANAGER"] as const) {
  const still = held(role, allWork);
  check(`${role} holds no department's daily work`, still.length === 0, still.join(", "));
}

console.log("\nThey keep every way of looking, and the decisions");
const LOOK: Permission[] = ["shipment.view", "batch.view", "customer.view", "exception.view", "finance.view", "accounting.view", "account.view", "ledger.view", "expense.view", "credit.view", "loan.view", "storage.view", "inventory.view", "delivery.history", "report.view", "profit.view", "audit.view", "records.viewDeleted", "pricing.view", "collections.view", "pickupNote.view"];
const DECIDE: Permission[] = ["exception.approve", "exception.close", "statement.review", "expense.approve", "payroll.approve", "credit.approve", "credit.limit", "invoice.priceReview", "invoice.discount", "invoice.storage.waive", "record.review", "account.reconcile", "ledger.adjust", "delivery.undo", "document.removeAny", "user.manage"];
for (const role of ["ADMIN", "MANAGER"] as const) {
  const lost = missing(role, [...LOOK, ...DECIDE]);
  check(`${role} keeps every view and every decision`, lost.length === 0, lost.join(", "));
}

console.log("\nThe owner's own controls, and the manager's step-in");
const OWNER_ONLY: Permission[] = ["settings.manage", "pricing.manage", "fx.manage", "account.manage", "shipment.purge"];
check("the owner holds the owner's controls", missing("ADMIN", OWNER_ONLY).length === 0, missing("ADMIN", OWNER_ONLY).join(", "));
check("the manager holds none of them", held("MANAGER", OWNER_ONLY).length === 0, held("MANAGER", OWNER_ONLY).join(", "));
const STEP_IN: Permission[] = ["exception.raise", "exception.investigate", "shipment.edit", "shipment.delete", "shipment.amendOutbound", "shipment.amendLanded", "shipment.move", "batch.undoArrival"];
check("the manager can step in on a cargo exception", missing("MANAGER", STEP_IN).length === 0, missing("MANAGER", STEP_IN).join(", "));
check("the owner leaves cargo corrections and casework to the manager", held("ADMIN", STEP_IN).length === 0, held("ADMIN", STEP_IN).join(", "));

console.log("\nA dashboard figure never opens a door to no-access");
check("the receiving dock opens the arrived batches for the owner", linkFor("ADMIN", "/app/receive") === "/app/shipments");
check("Finance's verify queue opens the read-only list for the manager", linkFor("MANAGER", "/app/finance/verify") === "/app/collections/submissions");
check("Finance still opens its own verify queue", linkFor("FINANCE", "/app/finance/verify") === "/app/finance/verify");
check("a ticket queue the manager cannot open is shown without a link", linkFor("MANAGER", "/app/support/tickets") === undefined);

console.log(fails === 0 ? "\nEvery duty is where it belongs." : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
