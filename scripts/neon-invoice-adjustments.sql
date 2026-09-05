-- Clearing a difference: the decision, and the figure it clears.
--
-- A customer sends 4,424,000 against a 4,424,625 bill. The 625 is never
-- coming. Finance decides the bill is settled, the balance reaches zero and
-- the cargo goes — and the payment row still says 4,424,000 for ever, because
-- that is what arrived.
--
-- WHAT THIS ADDS.
--
--   Invoice.amountAdjusted   the live sum of the rows below, for the aggregates
--   InvoiceAdjustment        one row per decision, kept for ever
--
-- NEVER MONEY. Nothing here reaches an account. No ledger line is written for
-- an adjustment and none should ever be — the same rule that keeps a credit
-- sale out of the ledger. Anything summing "collected" or "received" reads
-- amountPaid and the ledger, and this is neither.
--
-- WHY THE COLUMN AS WELL AS THE ROWS. The rows are the authority. The column
-- exists because roughly ten receivable figures are Prisma aggregates over the
-- Invoice table alone, and an aggregate cannot see a joined row; without it
-- each becomes a full read of the book.
--
-- RUN THIS BEFORE DEPLOYING THE CODE THAT READS IT. The column is defaulted
-- and the table is new, so every existing bill reads 0.00 and behaves exactly
-- as it does today.
--
-- Safe to run twice.

BEGIN;

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "amountAdjusted" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "InvoiceAdjustment" (
  "id"               TEXT PRIMARY KEY,
  "invoiceId"        TEXT NOT NULL,
  "amount"           DECIMAL(12,2) NOT NULL,
  "currency"         TEXT NOT NULL,
  "reason"           TEXT,
  "totalAtTime"      DECIMAL(12,2) NOT NULL,
  "amountPaidAtTime" DECIMAL(12,2) NOT NULL,
  "createdById"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt"       TIMESTAMP(3),
  "reversedById"     TEXT,
  "reversalReason"   TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceAdjustment_invoiceId_fkey') THEN
    ALTER TABLE "InvoiceAdjustment"
      ADD CONSTRAINT "InvoiceAdjustment_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceAdjustment_createdById_fkey') THEN
    ALTER TABLE "InvoiceAdjustment"
      ADD CONSTRAINT "InvoiceAdjustment_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceAdjustment_reversedById_fkey') THEN
    ALTER TABLE "InvoiceAdjustment"
      ADD CONSTRAINT "InvoiceAdjustment_reversedById_fkey"
      FOREIGN KEY ("reversedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InvoiceAdjustment_invoiceId_idx" ON "InvoiceAdjustment" ("invoiceId");
CREATE INDEX IF NOT EXISTS "InvoiceAdjustment_createdAt_idx" ON "InvoiceAdjustment" ("createdAt");

COMMIT;

-- Afterwards, every bill should read 0.00 and the table should be empty:
--
--   SELECT count(*), sum("amountAdjusted") FROM "Invoice";
--   SELECT count(*) FROM "InvoiceAdjustment";
