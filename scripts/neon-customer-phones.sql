-- ============================================================================
-- ONE CUSTOMER, SEVERAL NUMBERS
--
-- Lily Mike registers cargo from +255766471298 one week and +255766043553 the
-- next. The system matched customers on ONE phone column, so the second number
-- made a second Lily Mike — two accounts, two balances, and a customer who is
-- told they owe 29.70 when they owe 133.65. Two SIMs is not two people, and it
-- is the ordinary case here, not the exception.
--
-- Every number a customer uses now lives in its own row. `Customer.phone` stays
-- as the PRIMARY — the one staff ring, the one on the label, and the column
-- every existing screen already reads — and is mirrored here so lookups have
-- one place to ask.
--
-- Additive and safe on live data. Nothing is moved off Customer; the numbers
-- already on file are copied in, primary first, and altPhone comes with them.
--
--   psql "$DATABASE_URL" -f scripts/neon-customer-phones.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "CustomerPhone" (
  "id"         TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  -- Normalised to +255… before it is written, exactly as Customer.phone is.
  "phone"      TEXT NOT NULL,
  -- The one staff ring and the one printed on paperwork. Exactly one per
  -- customer, kept in step with Customer.phone.
  "isPrimary"  BOOLEAN NOT NULL DEFAULT false,
  -- "her husband", "the shop line" — why this number is on the account.
  "label"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "addedById"  TEXT,
  CONSTRAINT "CustomerPhone_pkey" PRIMARY KEY ("id")
);

-- A number belongs to ONE customer. This is the whole point: it is the key the
-- system matches on, and two owners for one number is two answers to "whose
-- cargo is this".
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPhone_phone_key"
  ON "CustomerPhone" ("phone");

CREATE INDEX IF NOT EXISTS "CustomerPhone_customerId_idx"
  ON "CustomerPhone" ("customerId");

ALTER TABLE "CustomerPhone"
  DROP CONSTRAINT IF EXISTS "CustomerPhone_customerId_fkey";
ALTER TABLE "CustomerPhone"
  ADD CONSTRAINT "CustomerPhone_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  -- Cascade: a number with no customer is a row nobody can read. Merging
  -- re-points them before the losing record goes, so nothing is lost there.
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerPhone"
  DROP CONSTRAINT IF EXISTS "CustomerPhone_addedById_fkey";
ALTER TABLE "CustomerPhone"
  ADD CONSTRAINT "CustomerPhone_addedById_fkey"
  FOREIGN KEY ("addedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The numbers already on file. Primary first.
INSERT INTO "CustomerPhone" ("id", "customerId", "phone", "isPrimary", "createdAt")
SELECT gen_random_uuid()::text, c."id", c."phone", true, c."createdAt"
  FROM "Customer" c
 WHERE c."phone" IS NOT NULL
ON CONFLICT ("phone") DO NOTHING;

-- Then the second number, where somebody had already recorded one.
INSERT INTO "CustomerPhone" ("id", "customerId", "phone", "isPrimary", "label", "createdAt")
SELECT gen_random_uuid()::text, c."id", c."altPhone", false, 'Other phone', c."createdAt"
  FROM "Customer" c
 WHERE c."altPhone" IS NOT NULL
   AND btrim(c."altPhone") <> ''
   AND c."altPhone" <> COALESCE(c."phone", '')
ON CONFLICT ("phone") DO NOTHING;

COMMIT;

SELECT
  (SELECT count(*) FROM "CustomerPhone") AS numbers_on_file,
  (SELECT count(*) FROM "CustomerPhone" WHERE "isPrimary") AS primaries,
  (SELECT count(*) FROM "Customer" WHERE "phone" IS NOT NULL) AS customers_with_a_number;
