-- Support's answer to "the customer sent a little less than the bill".
--
-- A bill of 36,450 answered by a transfer of 36,000 is the ordinary end of a
-- consignment: the 450 is a rounding at the far end, or the bank's fee, and it
-- is not coming. Support is the desk on the phone, so Support is the desk that
-- hears it — and until now the claim had nowhere to write it down. Finance
-- received a figure that was simply short, with no way to tell "the customer
-- underpaid and is being chased" from "this is settled, clear the last of it".
--
-- WHAT THIS ADDS.
--
--   PaymentSubmission.clearShortfall   what Support was told
--
-- It is a CLAIM and not a decision. Finance still ticks it on the verify
-- screen and the adjustment is written there, under their name, by the same
-- code path that writes one when Finance records a payment directly. This
-- column only means the verify screen opens with the right answer filled in
-- instead of Finance having to work out what Support already knew.
--
-- RUN THIS BEFORE DEPLOYING THE CODE THAT READS IT. The column is defaulted,
-- so every claim already in the table reads false — "nothing to clear" — which
-- is exactly what every claim ever raised meant.
--
-- Safe to run twice.

BEGIN;

ALTER TABLE "PaymentSubmission"
  ADD COLUMN IF NOT EXISTS "clearShortfall" BOOLEAN NOT NULL DEFAULT false;

COMMIT;

-- Afterwards, both should hold — the column exists, and no claim already in
-- the table has been changed by its arrival:
--
--   SELECT column_name, column_default, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'PaymentSubmission' AND column_name = 'clearShortfall';
--
--   SELECT "clearShortfall", count(*) FROM "PaymentSubmission" GROUP BY 1;
