// The other direction: USD tendered against a TZS-denominated invoice.
const RATE = 2700;
const r2 = (x: number) => Math.round(x * 100) / 100;
let refused = 0, total = 0, example = "";
for (let t = 100000; t <= 100200; t++) {          // outstanding, TZS, whole shillings
  const O = t;
  // shipment-actions.tsx: clearing = Number((outstanding / activeRate).toFixed(2))
  const clearing = Number((O / RATE).toFixed(2));
  // finance.ts: credited = amount * rateUsed  (NOT rounded — currencies differ, so it IS rounded to 2dp)
  const credited = r2(clearing * RATE);
  total++;
  if (credited > O + 0.001) { refused++; if (!example) example = `outstanding TZS ${O} -> form offers "USD ${clearing} clears the balance" -> server credits TZS ${credited} -> REFUSED (over by ${(credited - O).toFixed(2)})`; }
}
console.log(`USD-on-TZS: the form's own "clears the balance" figure is REFUSED by the server in ${refused}/${total} cases`);
console.log(example);
