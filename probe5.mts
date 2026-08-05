// Items 1, 2, 5: exhaustive rounding / tolerance behaviour at the live rate.
const RATE = 2700;
const r2 = (x: number) => Math.round(x * 100) / 100;

// (1) Can the FORM DEFAULT (whole-shilling pre-conversion) ever fail to clear?
let bad = 0, worst = "";
for (let cents = 1; cents <= 100000; cents++) {
  const O = cents / 100;                        // outstanding, always 2dp (Decimal(12,2))
  const T = Math.round(O * RATE);               // shipment-actions.tsx default
  const credited = r2(T / RATE);                // finance.ts credited
  if (credited !== O) { bad++; if (!worst) worst = `O=${O} T=${T} credited=${credited}`; }
}
console.log("(1) form-default tenders that do NOT clear exactly, O=0.01..1000.00 :", bad, worst);

// same, at the two band edges of paymentSchema.exchangeRate
for (const R of [100, 100000]) {
  let b = 0, ex = "";
  for (let cents = 1; cents <= 100000; cents++) {
    const O = cents / 100, T = Math.round(O * R), c = r2(T / R);
    if (c !== O) { b++; if (!ex) ex = `O=${O} T=${T} credited=${c}`; }
  }
  console.log(`    at rate ${R}:`, b, ex);
}

// (2) tolerance vs the 2dp step: smallest accepted/refused deltas
const O = 78.30;
for (const d of [-0.02, -0.01, 0, 0.01, 0.02]) {
  const credited = r2(O + d);
  const refused = credited > O + 0.001;
  const newPaid = credited;
  const settled = newPaid + 0.001 >= O;
  console.log(`(2/5) credited ${credited.toFixed(2)} vs outstanding ${O.toFixed(2)} -> ${refused ? "REFUSED" : "accepted"}${refused ? "" : `, settled=${settled}`}`);
}

// (3) direction, both ways, at the live rate
console.log("(3) TZS 357,210 tendered on a USD bill -> credited", r2(357210 / RATE), "USD   [server: amount/rate, form: typed/activeRate]");
console.log("(3) USD 132.30 tendered on a TZS bill -> credited", r2(132.30 * RATE), "TZS   [server: amount*rate, form: typed*activeRate]");

// (5) worst realistic TZS part-payment walk on a live invoice total
let total = 78.30, paid = 0, n = 0;
const notes = [50000, 20000, 10000, 100000];
while (total - paid > 0.005 && n < 20) {
  const outstanding = r2(total - paid);
  const want = Math.round(outstanding * RATE);
  const tender = Math.min(notes[n % notes.length], want);
  const credited = r2(tender / RATE);
  paid = r2(paid + credited);
  n++;
  console.log(`    part-payment ${n}: TZS ${tender} -> USD ${credited.toFixed(2)}  paid=${paid.toFixed(2)}  settled=${paid + 0.001 >= total}`);
}
