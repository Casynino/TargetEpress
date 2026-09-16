import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rules = await p.pricingRule.findMany({
  where: { active: true, method: "WEIGHT_BASED" },
  select: { id:true, category:true, cargoTypeId:true, price:true, currency:true,
            minWeightKg:true, maxWeightKg:true, minChargeableKg:true, minCharge:true },
  orderBy: [{ category: "asc" }],
});
for (const r of rules) console.log(JSON.stringify(r));
await p.$disconnect();
