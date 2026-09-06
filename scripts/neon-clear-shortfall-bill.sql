-- Which bill a merged claim's shortfall comes off.
--
-- Support ticks "the rest is not coming" on a transfer covering four
-- consignments. The claim carried the tick but not the answer to "which bill",
-- so verification refused it — after Support had been shown a confirmation
-- saying the bills would go out settled. The desk was then told to verify the
-- claim and write the difference off by hand on the bill's own page, which is
-- the manual work the tick exists to remove.
--
-- The screen has always decided this: the largest of the ticked bills. This
-- column carries that decision to Finance, so the bill they confirm is the
-- bill Support was shown.
--
-- RUN THIS BEFORE DEPLOYING THE CODE THAT READS IT. Nullable with no default,
-- so every claim already in the table is untouched: null means "one bill, no
-- question", which is what every existing claim is.
--
-- Safe to run twice.

ALTER TABLE "PaymentSubmission"
  ADD COLUMN IF NOT EXISTS "clearShortfallInvoiceId" TEXT;

-- Afterwards:
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'PaymentSubmission'
--      AND column_name = 'clearShortfallInvoiceId';
