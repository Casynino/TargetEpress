-- Transport as a component of a customer payment.
--
-- A customer settling a consignment often sends the freight and the delivery
-- in one transfer: 80,000 for the cargo and 20,000 to have it brought to them.
-- Until now the system had no idea the second half existed — it would either
-- refuse the payment as an overpayment, or bank the whole 100,000 as though
-- the company had earned it.
--
-- WHAT THIS ADDS.
--
--   Payment.transportAmount    the half that was never the company's
--   Payment.transportSourceId  which account it is settled out of
--   LedgerKind TRANSPORT_OUT   a kind for money only passing through
--   LedgerEntry two legs       the money in, and the transport settled out
--
-- RUN THIS BEFORE DEPLOYING THE CODE THAT READS IT. Every column is nullable
-- or defaulted, so the rows already in the table are untouched and behave
-- exactly as they did: transportAmount 0 means a payment with no transport,
-- which is every payment ever taken.
--
-- THE ONE THING TO READ TWICE is the index swap at the bottom. LedgerEntry
-- carried a unique index on paymentId alone — one ledger line per payment —
-- and a payment with transport writes two: an IN for what the customer sent
-- and an OUT for the transport. The pair (paymentId, direction) replaces it,
-- which is the same shape AccountTransfer has always used for its two legs.
-- It is still the database, not the application, that refuses a third line.
--
-- Safe to run twice.

BEGIN;

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "transportAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "transportSourceId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payment_transportSourceId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_transportSourceId_fkey"
      FOREIGN KEY ("transportSourceId") REFERENCES "CompanyAccount"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Payment_transportSourceId_idx"
  ON "Payment" ("transportSourceId");

-- A kind of its own, because this money is neither income nor expense: it
-- arrived with the cargo money and goes straight out again, so it must not
-- reach revenue, must not reach profit, and must not be netted against
-- CUSTOMER_PAYMENT when the register is reconciled against what customers
-- actually sent.
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'TRANSPORT_OUT';

COMMIT;

-- Separate transaction: ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction that then relies on the new value, and the index swap below is
-- independent of it either way.
BEGIN;

DROP INDEX IF EXISTS "LedgerEntry_paymentId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_paymentId_direction_key"
  ON "LedgerEntry" ("paymentId", "direction");

COMMIT;

-- Afterwards, all three should hold:
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'Payment'
--      AND column_name IN ('transportAmount','transportSourceId');
--
--   SELECT unnest(enum_range(NULL::"LedgerKind"));
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'LedgerEntry' AND indexname LIKE '%paymentId%';
