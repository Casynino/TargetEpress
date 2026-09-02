-- ONE REAL PAYMENT = ONE PAYMENT RECORD, enforced by the database.
--
-- The application already refuses a second claim on a bill: submitPaymentForVerification
-- looks for a PENDING submission before creating one, and recordPayment refuses outright
-- while one is waiting. Both are reads followed by a write, and under READ COMMITTED two
-- desks submitting in the same instant can each read "none pending" and both insert.
--
-- This index makes that impossible rather than unlikely. Partial, so VERIFIED, REJECTED
-- and WITHDRAWN rows are untouched — a bill may accumulate any number of those over its
-- life, and only one of them may be outstanding at a time.
--
-- CONCURRENTLY so it does not lock the table against a live counter. Run it BEFORE
-- deploying, as with every schema change on this system; it is additive and safe to run
-- against the current data.
--
-- If it fails with a uniqueness error, two pending submissions already exist. Find them:
--
--   SELECT "invoiceId", count(*) FROM "PaymentSubmission"
--   WHERE status = 'PENDING' GROUP BY "invoiceId" HAVING count(*) > 1;
--
-- Reject or withdraw the duplicates through the app, then run this again.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  "PaymentSubmission_one_pending_per_invoice"
  ON "PaymentSubmission" ("invoiceId")
  WHERE status = 'PENDING';
