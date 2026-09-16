/**
 * THE ONE FUNCTION EVERY DOOR THAT MOVES A TOTAL CALLS.
 *
 * Twelve callers derive an invoice's stored status through it, and the pickup
 * gate reads that status to decide whether cargo may leave. A wrong answer
 * here either traps a parcel nobody owes anything on or releases one somebody
 * does, so every branch is pinned rather than trusted.
 */
import { invoiceStatusFor } from "@/lib/invoice-status";

const cases: [string, string, number, number, number, string | null][] = [
  ["zero bill, nothing paid",      "UNPAID",  0,     0,     0,        "PAID"],
  ["zero bill, rounding dust",     "UNPAID",  0,     0.004, 0,        "PAID"],
  ["normal unpaid",                "UNPAID",  0,     13.5,  0,        "UNPAID"],
  ["part paid",                    "UNPAID",  5,     13.5,  0,        "PARTIALLY_PAID"],
  ["paid in full",                 "UNPAID",  13.5,  13.5,  0,        "PAID"],
  ["cleared by adjustment",        "UNPAID",  13,    13.5,  0.5,      "PAID"],
  ["overpaid",                     "UNPAID",  20,    13.5,  0,        "PAID"],
  ["draft untouched",              "DRAFT",   0,     0,     0,        null],
  ["void untouched",               "VOID",    0,     0,     0,        null],
  ["written off untouched",        "WRITTEN_OFF", 0, 0,     0,        null],
];

let bad = 0;
for (const [label, current, paid, total, adjusted, expected] of cases) {
  const got = invoiceStatusFor(current, paid, total, adjusted);
  const ok = got === expected;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label.padEnd(26)} → ${got} (expected ${expected})`);
}
console.log(bad === 0 ? "\nAll status cases correct." : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
