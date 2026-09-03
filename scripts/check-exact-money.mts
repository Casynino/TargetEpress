/**
 * WHAT YOU TYPE IS WHAT IS STORED.
 *
 *   npx tsx --conditions=react-server scripts/check-exact-money.mts
 *
 * The owner's rule, given three times and each time after a wrong figure
 * reached a screen: "if I write 20,000 it should record 20,000 — not less, not
 * more, no rounding up, no added decimals."
 *
 * A money figure crosses four boundaries between the keyboard and the books,
 * and each one is somewhere a digit can be lost: the input box that reformats
 * as you type, the schema that turns text into a number, the Decimal column it
 * is written to, and the rate book that computes a price without anybody
 * typing at all. This walks all four with the figures this business actually
 * uses and fails if any of them changes one.
 *
 * It exists because the fixes are invisible from a screenshot. Whole-dollar
 * rounding made a 1 kg parcel read USD 14 against a price list that says
 * 13.50, and nobody could see why by looking at it.
 */
import { Prisma } from "@prisma/client";
import { quote } from "@/lib/pricing";
import { toNumber } from "@/lib/format";

let ok = true;
const check = (label: string, got: unknown, want: unknown) => {
  const good = String(got) === String(want);
  if (!good) ok = false;
  console.log(`${good ? "  " : "!!"} ${label.padEnd(46)} ${String(got).padStart(12)}   ${good ? "" : `EXPECTED ${want}`}`);
};

console.log("1. THE BOX — what survives typing (mirrors money-input.tsx)");
function typed(text: string, decimals = 2) {
  let out = "", seen = false, places = 0;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") {
      if (seen) { if (places >= decimals) continue; places += 1; }
      out += ch; continue;
    }
    if (ch === "." && !seen && decimals > 0) { seen = true; out += "."; }
  }
  return out.replace(/^0+(?=\d)/, "");
}
check('you type "20,000"', typed("20,000"), "20000");
check('you type "30,000"', typed("30,000"), "30000");
check('you type "1,850,000"', typed("1,850,000"), "1850000");
check('you type "13.50"', typed("13.50"), "13.50");
check('you type "007"', typed("007"), "7");

console.log("\n2. THE FORM — what the schema hands the action (Number, no rounding)");
for (const [text, want] of [["20000", 20000], ["30000", 30000], ["1850000", 1850000], ["13.5", 13.5]] as const) {
  check(`schema parses "${text}"`, Number(text), want);
}

console.log("\n3. THE COLUMN — what Prisma writes to Decimal(12,2)");
for (const n of [20000, 30000, 1850000, 13.5]) {
  check(`Decimal(${n})`, new Prisma.Decimal(n).toString(), String(n));
}

console.log("\n4. THE RATE BOOK — freight, with the point, not rounded");
for (const [kg, want] of [[0.3, 13.5], [1.2, 16.2], [7.9, 106.65], [21.8, 272.5], [36.1, 451.25]] as const) {
  const p = await quote({ category: "NORMAL_GOODS", weightKg: kg, quantity: 1 });
  check(`${kg} kg`, p.ok ? p.total : "REFUSED", want);
}

console.log("\n5. THE ROUND TRIP — stored, read back, unchanged");
for (const n of [20000, 30000, 1850000]) {
  check(`TSh ${n.toLocaleString()} in and out`, toNumber(new Prisma.Decimal(n)), n);
}

console.log(ok ? "\nPASS — nothing added, nothing rounded, nothing lost" : "\nFAIL");
process.exit(ok ? 0 : 1);
