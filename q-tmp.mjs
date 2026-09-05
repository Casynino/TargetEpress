import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const sh = await p.shipment.findUnique({ where: { id: 'cmto567jq0005sbbxy256sj03' } });
const inv = await p.invoice.findUnique({ where: { id: 'cmto567js0007sbbxvmehxi60' } });
console.log(JSON.stringify(sh,null,1));
console.log(JSON.stringify(inv,null,1));
await p.$disconnect();
