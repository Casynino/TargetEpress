-- ============================================================================
-- ONE CLAIM, SEVERAL BILLS
--
-- Support hears from a customer who sent one transfer covering four
-- consignments. A PaymentSubmission could only ever name ONE invoice, so the
-- desk had to raise four claims for one transfer — and Finance then verified
-- four times, producing four payments, four receipts and four account
-- movements for a deposit the bank shows once. That is precisely what the
-- combined payment screen was built to stop, and Support was locked out of it.
--
-- This gives a submission the same shape a Payment already has: a customer, an
-- optional single invoice, and a set of allocations saying which bills the
-- claim covers.
--
-- Additive and safe on live data. Every existing submission keeps its invoice
-- and gains one allocation describing what it already claimed, so the
-- verification path reads the same shape for old claims and new ones.
--
--   psql "$DATABASE_URL" -f scripts/neon-submission-allocations.sql
-- ============================================================================

BEGIN;

-- 1. Whose money the claim is. Null on every existing row; backfilled below
--    from the invoice each one already points at.
ALTER TABLE "PaymentSubmission"
  ADD COLUMN IF NOT EXISTS "customerId" TEXT;

-- 2. invoiceId stays REQUIRED. A combined claim anchors to one of the bills it
--    covers — which one is arbitrary and says nothing, the allocations below
--    are the truth — because that column is what every existing screen still
--    reads, and an anchor keeps them working rather than making each of them
--    handle an absence it has no way to show. The same treatment
--    Payment.invoiceId already gets.

-- 3. Which bills one claim covers, and how much against each.
CREATE TABLE IF NOT EXISTS "SubmissionAllocation" (
  "id"           TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "invoiceId"    TEXT NOT NULL,
  -- In the currency the CLAIM is made in — what the customer says they sent
  -- against this bill. Finance converts at the bill's own frozen rate when it
  -- verifies, exactly as the counter does.
  "amount"       DECIMAL(12,2) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionAllocation_pkey" PRIMARY KEY ("id")
);

-- One line per bill per claim. Two answers to "how much did this claim put
-- against that invoice" is not a question anybody can settle later.
CREATE UNIQUE INDEX IF NOT EXISTS "SubmissionAllocation_submissionId_invoiceId_key"
  ON "SubmissionAllocation" ("submissionId", "invoiceId");

CREATE INDEX IF NOT EXISTS "SubmissionAllocation_invoiceId_idx"
  ON "SubmissionAllocation" ("invoiceId");

-- A share of nothing is not a claim, and a negative one is money walking
-- backwards out of a bill.
ALTER TABLE "SubmissionAllocation"
  DROP CONSTRAINT IF EXISTS "SubmissionAllocation_amount_positive";
ALTER TABLE "SubmissionAllocation"
  ADD CONSTRAINT "SubmissionAllocation_amount_positive" CHECK ("amount" > 0);

-- 4. The keys. A deleted claim takes its allocations with it; a deleted
--    invoice does the same, because an allocation to a bill that no longer
--    exists is a row nobody can read.
ALTER TABLE "SubmissionAllocation"
  DROP CONSTRAINT IF EXISTS "SubmissionAllocation_submissionId_fkey";
ALTER TABLE "SubmissionAllocation"
  ADD CONSTRAINT "SubmissionAllocation_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "PaymentSubmission"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubmissionAllocation"
  DROP CONSTRAINT IF EXISTS "SubmissionAllocation_invoiceId_fkey";
ALTER TABLE "SubmissionAllocation"
  ADD CONSTRAINT "SubmissionAllocation_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentSubmission"
  DROP CONSTRAINT IF EXISTS "PaymentSubmission_customerId_fkey";
ALTER TABLE "PaymentSubmission"
  ADD CONSTRAINT "PaymentSubmission_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  -- Restrict, like Payment: a customer with money claimed against their name
  -- is not a row anybody deletes by accident.
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "PaymentSubmission_customerId_idx"
  ON "PaymentSubmission" ("customerId");

-- 5. Backfill, so old claims and new ones read the same.
--    The customer comes off the bill the claim already names.
UPDATE "PaymentSubmission" s
   SET "customerId" = i."customerId"
  FROM "Invoice" i
 WHERE s."invoiceId" = i."id"
   AND s."customerId" IS NULL;

--    And one allocation describing what each existing claim already said. Only
--    for claims still PENDING: a verified one has become a Payment with its own
--    allocation, and a rejected one never settled anything.
INSERT INTO "SubmissionAllocation" ("id", "submissionId", "invoiceId", "amount", "createdAt")
SELECT
  gen_random_uuid()::text,
  s."id",
  s."invoiceId",
  s."amount",
  s."submittedAt"
  FROM "PaymentSubmission" s
 WHERE s."invoiceId" IS NOT NULL
   AND s."status" = 'PENDING'
   AND s."amount" > 0
ON CONFLICT ("submissionId", "invoiceId") DO NOTHING;

COMMIT;

-- What it did.
SELECT
  (SELECT count(*) FROM "SubmissionAllocation") AS allocations,
  (SELECT count(*) FROM "PaymentSubmission" WHERE "customerId" IS NOT NULL) AS claims_with_customer,
  (SELECT count(*) FROM "PaymentSubmission" WHERE "status" = 'PENDING') AS pending_claims;
