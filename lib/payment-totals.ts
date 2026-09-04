import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * THE FIGURES EVERY SCREEN QUOTES FOR "MONEY COLLECTED".
 *
 * Four screens each asked the database this question in their own words, and
 * three of the four got it wrong in the same two ways.
 *
 * A cancelled payment stays in its month forever: a void stamps `voidedAt` and
 * leaves `paidAt` alone, deliberately, because the payment really was taken on
 * that day and pretending otherwise would rewrite a closed month. So every
 * total has to exclude it, or the owner's revenue keeps counting money that was
 * handed back — and the reversing line the void posts is the proof it went.
 *
 * And `creditedAmount` is nullable. It is written when the money is restated
 * into the bill's currency, which is not every payment and was not any payment
 * before the column existed. Summing it alone silently counts those as zero.
 * `COALESCE(creditedAmount, amount)` is the rule everywhere in this codebase
 * and it is not optional.
 *
 * One place, so the four screens cannot answer the same question differently
 * again.
 */

export type CollectedTotal = { usd: number; count: number };

const LIVE = Prisma.sql`"voidedAt" IS NULL`;
const CREDITED = Prisma.sql`COALESCE("creditedAmount", "amount")`;

async function one(where: Prisma.Sql): Promise<CollectedTotal> {
  const [row] = await prisma.$queryRaw<{ usd: number; count: number }[]>(
    Prisma.sql`
      SELECT COALESCE(SUM(${CREDITED}), 0)::float8 AS usd,
             COUNT(*)::int                         AS count
        FROM "Payment"
       WHERE ${where}
    `
  );
  return { usd: row?.usd ?? 0, count: row?.count ?? 0 };
}

/** Everything taken since `from`, and everything ever taken. */
export async function collectedTotals(from: Date) {
  const [month, allTime] = await Promise.all([
    one(Prisma.sql`${LIVE} AND "paidAt" >= ${from}`),
    one(LIVE),
  ]);
  return { month, allTime };
}

/**
 * Money in hand that nobody has said where it went.
 *
 * A job rather than a statistic, which is why the count matters as much as the
 * figure — and why a cancelled payment must not appear in it. It landed in no
 * account by definition, and asking a desk to chase one is asking them to
 * chase nothing.
 */
export async function unattributedTotal(): Promise<CollectedTotal> {
  return one(Prisma.sql`${LIVE} AND "accountId" IS NULL`);
}

/** Where the money went, by the account that received it. */
export async function collectedByAccount() {
  return prisma.$queryRaw<
    { accountId: string | null; name: string | null; total: number; count: number }[]
  >(Prisma.sql`
    SELECT p."accountId",
           a."name",
           SUM(COALESCE(p."creditedAmount", p."amount"))::float8 AS total,
           COUNT(*)::int                                         AS count
      FROM "Payment" p
      LEFT JOIN "CompanyAccount" a ON a."id" = p."accountId"
     WHERE p."voidedAt" IS NULL
     GROUP BY p."accountId", a."name"
     ORDER BY total DESC
  `);
}

/**
 * What customers actually handed over, in the currency they handed it over in.
 *
 * Deliberately NOT the credited figure. This answers "is this a shilling
 * business", and a shilling payment against a dollar bill is stored credited in
 * dollars — so quoting the credited column here divided a shilling total by the
 * bill's frozen rate and then multiplied it back by today's, which is two
 * conversions of a number that never needed one.
 */
export async function tenderedByCurrency() {
  return prisma.$queryRaw<{ currency: string; tendered: number; count: number }[]>(
    Prisma.sql`
      SELECT "currency",
             COALESCE(SUM("amount"), 0)::float8 AS tendered,
             COUNT(*)::int                      AS count
        FROM "Payment"
       WHERE ${LIVE}
       GROUP BY "currency"
    `
  );
}
