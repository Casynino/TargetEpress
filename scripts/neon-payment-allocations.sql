-- ONE REAL PAYMENT, MANY BILLS SETTLED.
--
-- A customer with three unpaid consignments sends one mobile-money transfer for
-- all three. Today that cannot be recorded honestly: Payment carries a single
-- invoiceId, so the desk has to split one transfer into three payments — three
-- receipts, three ledger lines, three account movements, for one deposit that
-- will appear on the bank statement exactly once. Reconciliation can then never
-- match, and the account balance is right only by accident.
--
-- So settlement stops being a column on the payment and becomes its own table.
-- The payment remains ONE row, ONE ledger line, ONE account movement. What it
-- settles is a list of allocations against it, and what it does not settle is
-- the customer's credit — derived, not stored, like every other figure here.
--
-- RUN THIS BEFORE DEPLOYING THE CODE THAT READS IT. Prisma names every column
-- it selects, so the application will start failing on the next request the
-- moment the schema and the database disagree. Additive and idempotent: it adds
-- a table and a column, widens one constraint, and backfills what is already
-- there. It removes nothing.
--
--   psql "$DATABASE_URL" -f scripts/neon-payment-allocations.sql
--
-- Then run the two checks at the bottom. They must both return zero rows.

BEGIN;

-- 1 ─ A payment belongs to a CUSTOMER, not only to a bill.
--
-- Required for the money that arrives ahead of any invoice, or beyond all of
-- them: an overpayment held as credit belongs to somebody, and today there is
-- nowhere to say who. Backfilled from the invoice each existing payment was
-- recorded against, which is where that fact already lives.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "customerId" TEXT;

UPDATE "Payment" p
   SET "customerId" = i."customerId"
  FROM "Invoice" i
 WHERE i.id = p."invoiceId"
   AND p."customerId" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payment_customerId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Payment_customerId_idx" ON "Payment" ("customerId");

-- 2 ─ The bill on the payment becomes optional.
--
-- It stays for now, as the bill the payment was RAISED against, so nothing that
-- reads it breaks on the day this lands. Settlement moves to the allocations
-- below. Money taken as pure customer credit has no invoice at all, which is
-- the case this column could never express.
ALTER TABLE "Payment" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- 3 ─ What each payment actually settled.
CREATE TABLE IF NOT EXISTS "PaymentAllocation" (
  "id"          TEXT NOT NULL,
  "paymentId"   TEXT NOT NULL,
  "invoiceId"   TEXT NOT NULL,
  -- In the INVOICE's currency, which is what settles a bill — the same
  -- discipline as Payment.creditedAmount. Never the tendered figure.
  "amount"      DECIMAL(12,2) NOT NULL,
  "note"        TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id"),
  -- An allocation is a settlement, and a settlement of nothing is not one.
  CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amount" > 0)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAllocation_paymentId_fkey') THEN
    ALTER TABLE "PaymentAllocation"
      ADD CONSTRAINT "PaymentAllocation_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "Payment"(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAllocation_invoiceId_fkey') THEN
    ALTER TABLE "PaymentAllocation"
      ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAllocation_createdById_fkey') THEN
    ALTER TABLE "PaymentAllocation"
      ADD CONSTRAINT "PaymentAllocation_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- One line per bill per payment. A second settlement of the same bill by the
-- same payment is an edit of the first, not another row — which is what keeps
-- "how much did payment X put against invoice Y" a question with one answer.
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAllocation_paymentId_invoiceId_key"
  ON "PaymentAllocation" ("paymentId", "invoiceId");
CREATE INDEX IF NOT EXISTS "PaymentAllocation_invoiceId_idx"
  ON "PaymentAllocation" ("invoiceId");

-- 4 ─ Everything already taken, written as the allocation it always was.
--
-- COALESCE(creditedAmount, amount) is the house rule and it matters here more
-- than anywhere: older USD payments have a null credited column, and summing
-- the column alone would silently backfill them as zero — every one of those
-- invoices would then read as never settled.
--
-- Voided payments are deliberately skipped. A void gives the invoice back
-- exactly what the payment settled, so a voided payment settles nothing today;
-- writing an allocation for one would re-assert money that was taken back.
INSERT INTO "PaymentAllocation" ("id", "paymentId", "invoiceId", "amount", "createdById", "createdAt", "note")
SELECT
  'alloc_' || p.id,
  p.id,
  p."invoiceId",
  COALESCE(p."creditedAmount", p.amount),
  p."receivedById",
  p."paidAt",
  'Backfilled from the payment''s own invoice when allocations were introduced.'
FROM "Payment" p
WHERE p."invoiceId" IS NOT NULL
  AND p."voidedAt" IS NULL
  AND COALESCE(p."creditedAmount", p.amount) > 0
ON CONFLICT ("paymentId", "invoiceId") DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK BEFORE DEPLOYING. Both queries must return no rows.
--
-- A) Every invoice's allocations must add up to exactly what it is recorded as
--    having been paid. A row here means the backfill and the books disagree,
--    and the code must NOT be deployed until it is understood.
--
--   SELECT i."invoiceNumber", i."amountPaid", COALESCE(SUM(a.amount), 0) AS allocated
--     FROM "Invoice" i
--     LEFT JOIN "PaymentAllocation" a ON a."invoiceId" = i.id
--    GROUP BY i.id, i."invoiceNumber", i."amountPaid"
--   HAVING ABS(i."amountPaid" - COALESCE(SUM(a.amount), 0)) > 0.005;
--
-- B) No payment may have allocated more than it received.
--
--   SELECT p.id, COALESCE(p."creditedAmount", p.amount) AS received,
--          SUM(a.amount) AS allocated
--     FROM "Payment" p
--     JOIN "PaymentAllocation" a ON a."paymentId" = p.id
--    GROUP BY p.id, p."creditedAmount", p.amount
--   HAVING SUM(a.amount) > COALESCE(p."creditedAmount", p.amount) + 0.005;
