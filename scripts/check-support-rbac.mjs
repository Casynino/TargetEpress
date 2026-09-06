/**
 * Checks the Customer Support role against the two lists in the spec.
 *
 *   node scripts/check-support-rbac.mjs
 *
 * Reads lib/rbac.ts as text rather than importing it, so it runs in plain Node
 * without a TypeScript loader or the server-only guard. Exits non-zero on any
 * permission the department should not hold — which makes it usable as a
 * pre-deploy gate after anyone edits the permission table.
 */
import { readFileSync } from "node:fs";

const src = readFileSync("lib/rbac.ts", "utf8");

const grab = (name) => {
  const match = src.match(
    new RegExp(`const ${name}: Permission\\[\\] = \\[([\\s\\S]*?)\\];`)
  );
  if (!match) throw new Error(`${name} not found in lib/rbac.ts`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

const CARE = grab("CUSTOMER_CARE");

/** Straight from the spec's "Customer Support CANNOT" list. */
const MUST_NOT = {
  "Register shipments": "shipment.create",
  "Edit shipment weight": "shipment.edit",
  "Change shipment status": "shipment.depart",
  "Receive cargo": "batch.receive",
  "Verify cargo against the manifest": "batch.verify",
  "Release cargo": "shipment.release",
  "Confirm or record payments": "payment.record",
  "Generate pickup notes": "pickupNote.issue",
  "Cancel pickup notes": "pickupNote.cancel",
  "Create batches": "batch.create",
  "Modify batches": "batch.manage",
  "Delete shipment records": "shipment.cancel",
  "Change the rate book": "pricing.manage",
  "Publish exchange rates": "fx.manage",
  "Manage staff accounts": "user.manage",
  /*
    MOVED HERE FROM THE "CAN" LIST.

    The spec this file was written against gave Support discounts, on the
    reasoning that whoever agrees a price agrees the reduction. The owner drew
    the line differently afterwards: giving money away is Finance's and the
    manager's, and Support asks rather than decides. lib/rbac.ts says so in
    full; this list is the gate that keeps it said.
  */
  "Apply discounts": "invoice.discount",
};

/** Straight from the spec's "Customer Support CAN" list. */
const MUST_HAVE = {
  "View shipment details": "shipment.view",
  "View shipment photos and history": "shipment.viewInternal",
  "View customer profiles": "customer.view",
  "View pricing": "finance.view",
  "Generate invoices": "invoice.manage",
  "Edit invoices before payment": "invoice.edit",
  /* What this desk keeps instead of the discount: the rate on one bill, and
     forgiving the storage clock. Both bounded, both audited. */
  "Agree the rate on one bill": "invoice.rate",
  "Waive storage": "invoice.storage.waive",
  "Send invoices": "invoice.send",
  "Manage support tickets": "ticket.manage",
  "Manage sourcing requests": "sourcing.manage",
  "Contact customers": "message.send",
};

let failures = 0;

console.log("Customer Support — must NOT be able to:");
for (const [label, permission] of Object.entries(MUST_NOT)) {
  const held = CARE.includes(permission);
  if (held) failures++;
  console.log(`  ${held ? "✗ LEAK" : "✓"} ${label}  (${permission})`);
}

console.log("\nCustomer Support — must be able to:");
for (const [label, permission] of Object.entries(MUST_HAVE)) {
  const held = CARE.includes(permission);
  if (!held) failures++;
  console.log(`  ${held ? "✓" : "✗ MISSING"} ${label}  (${permission})`);
}

console.log(
  `\n${failures === 0 ? "PASS — the boundary matches the spec" : `FAIL — ${failures} problem(s)`}`
);
process.exit(failures ? 1 : 0);
