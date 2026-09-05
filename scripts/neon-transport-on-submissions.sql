-- The transport split, said at the moment Support claims the payment.
--
-- Support is the desk the customer talks to, so Support is the only desk that
-- hears "that transfer includes the transport". Until now there was nowhere to
-- write it down: the claim carried one figure, which was LARGER than the bill
-- whenever transport was in it, and Finance saw an apparent overpayment with
-- no explanation attached. They then either sent back a correct claim or
-- agreed a wrong one, and neither is a thing a business should be doing with
-- a customer's money.
--
-- WHAT THIS ADDS.
--
--   PaymentSubmission.transportAmount    the delivery half of the claim
--   PaymentSubmission.transportSourceId  where Support expects it paid from
--
-- Both are claims, exactly like the amount and the account beside them.
-- Nothing here reaches the ledger; verification carries them into the Payment
-- and the Payment's own columns are where the money lives.
--
-- RUN THIS BEFORE DEPLOYING THE CODE THAT READS IT. Every column is defaulted
-- or nullable, so the rows already in the table are untouched: transportAmount
-- 0 means a claim with no transport in it, which is every claim ever raised.
--
-- Safe to run twice.

BEGIN;

ALTER TABLE "PaymentSubmission"
  ADD COLUMN IF NOT EXISTS "transportAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "PaymentSubmission"
  ADD COLUMN IF NOT EXISTS "transportSourceId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'PaymentSubmission_transportSourceId_fkey'
  ) THEN
    ALTER TABLE "PaymentSubmission"
      ADD CONSTRAINT "PaymentSubmission_transportSourceId_fkey"
      FOREIGN KEY ("transportSourceId") REFERENCES "CompanyAccount"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PaymentSubmission_transportSourceId_idx"
  ON "PaymentSubmission" ("transportSourceId");

COMMIT;

-- Afterwards both columns should be listed, and every existing claim should
-- read 0.00 with a null source:
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'PaymentSubmission'
--      AND column_name IN ('transportAmount','transportSourceId');
--
--   SELECT count(*), sum("transportAmount") FROM "PaymentSubmission";
