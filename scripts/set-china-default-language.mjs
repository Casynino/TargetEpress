/**
 * Open the Guangzhou desk in Chinese.
 *
 *   node scripts/set-china-default-language.mjs           # show what would change
 *   node scripts/set-china-default-language.mjs --commit  # do it
 *
 * New accounts get this from `defaultLocaleForRole` at creation. This is for the
 * China accounts that already existed when that rule was added — they were all
 * created carrying the column default of "en".
 *
 * Only touches accounts still sitting on "en". If somebody at that desk has
 * already chosen a language for themselves, their choice is theirs and this
 * leaves it alone.
 */

import { PrismaClient } from "@prisma/client";

const commit = process.argv.includes("--commit");
const prisma = new PrismaClient();

const host = (process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@");
console.log(`database: ${host.slice(0, 78) || "(DATABASE_URL not set)"}`);
console.log(commit ? "mode: COMMIT\n" : "mode: dry run — pass --commit to apply\n");

const candidates = await prisma.user.findMany({
  where: { role: "CHINA_WAREHOUSE", preferredLanguage: "en" },
  select: { id: true, name: true, email: true },
});

if (candidates.length === 0) {
  console.log("Nothing to change — every Guangzhou account already has a language set.");
} else {
  for (const u of candidates) console.log(`  ${u.name} <${u.email}>  en -> zh`);
  if (commit) {
    const { count } = await prisma.user.updateMany({
      where: { role: "CHINA_WAREHOUSE", preferredLanguage: "en" },
      data: { preferredLanguage: "zh" },
    });
    console.log(`\n${count} account(s) now open in Chinese.`);
  } else {
    console.log(`\n${candidates.length} account(s) would change. Re-run with --commit.`);
  }
}

await prisma.$disconnect();
