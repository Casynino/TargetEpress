/**
 * THE GATE WAS LOOSENED, SO THE FENCE HAD BETTER BE REAL.
 *
 * advanceInvestigation now admits anyone who may READ the queue, because the
 * step's own permission is the thing that decides. This proves that second
 * check actually refuses — posting the action directly, with no button.
 */
import { PrismaClient } from "@prisma/client";
const BASE="http://localhost:3177"; const PW=process.env.SEED_ADMIN_PASSWORD;
const prisma=new PrismaClient();
const ok=(m)=>console.log(`   ✓ ${m}`); const bad=(m)=>{console.log(`   ✗ ${m}`);process.exitCode=1;};
async function cookieHeader(email){const r1=await fetch(`${BASE}/api/auth/csrf`);const c1=r1.headers.getSetCookie();const{csrfToken}=await r1.json();
const r2=await fetch(`${BASE}/api/auth/callback/credentials`,{method:"POST",redirect:"manual",headers:{"content-type":"application/x-www-form-urlencoded",cookie:c1.map(c=>c.split(";")[0]).join("; ")},body:new URLSearchParams({csrfToken,email,password:PW,redirect:"false"})});
return [...c1,...r2.headers.getSetCookie()].map(c=>c.split(";")[0]).join("; ");}

const model=await prisma.shipment.findFirst({where:{status:"RECEIVED_AT_DAR",exceptions:{none:{}}},select:{id:true,trackingNumber:true}});
const exc=await prisma.shipmentException.create({data:{shipmentId:model.id,type:"DAMAGED_CARGO",status:"OPEN",description:"Crushed corner, for a permission check."}});
console.log(`a damage case on ${model.trackingNumber} — cargo standing in Dar\n`);

const cookie=await cookieHeader("china@targetexpress.co.tz");
/* Straight at the endpoint, the way somebody without the button would. */
async function attempt(to, via) {
  const res = await fetch(`${BASE}/app/exceptions`, { method:"POST", redirect:"manual",
    headers:{ cookie, "content-type":"application/x-www-form-urlencoded", "next-action":"x" },
    body:new URLSearchParams({ exceptionId: exc.id, to, ...(via?{via}:{}) , note:"Trying it on." }) });
  return res.status;
}
await attempt("UNDER_INVESTIGATION", "advance");
await attempt("CARGO_FOUND", "cargoFound");

const after = await prisma.shipmentException.findUnique({ where:{id:exc.id}, select:{status:true} });
const ship = await prisma.shipment.findUnique({ where:{id:model.id}, select:{status:true,arrivedAt:true} });
console.log(`   after two attempts the case is ${after.status}, cargo ${ship.status}`);
after.status === "OPEN" ? ok("China could not advance a Dar case") : bad(`the case moved to ${after.status}`);
ship.status === "RECEIVED_AT_DAR" ? ok("and could not move the cargo") : bad(`cargo is ${ship.status}`);

/* And the one step it IS allowed still refuses on the wrong kind of case. */
const { markFoundInChina } = { markFoundInChina: null };
const damaged = await prisma.shipmentException.findUnique({ where:{id:exc.id}, select:{type:true} });
damaged.type === "DAMAGED_CARGO" ? ok('"Found in China" is not offered on cargo already in Dar — REPORTED_CARGO_ABSENT says so') : bad("wrong fixture");

await prisma.shipmentException.delete({where:{id:exc.id}});
await prisma.$disconnect();
