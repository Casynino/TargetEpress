-- The schema this audit's code needs, to be run on Neon BEFORE the deploy.
--
-- Additive and safe against live data: three nullable columns and seven
-- indexes. Nothing is dropped, nothing is rewritten, and every existing row
-- keeps the values it has. Running it twice is harmless.
--
-- WHY IT MUST GO FIRST. recordPayment, recordExpense and the two claim actions
-- write "idempotencyKey" on every insert. Deploying that code against a
-- database without the column makes every one of those inserts fail — which is
-- every payment, every cost and every claim the business takes.
--
-- The unique indexes are the point of the columns: a form instance carries one
-- key, so two simultaneous submissions of the same form collide here instead
-- of both becoming money. Nulls do not collide, so the rows already in the
-- table are untouched by it.
--
-- The plain indexes are for reads that had none: the three shipment dates
-- every dashboard and ageing report ranges on, and filtering the register by
-- who recorded a line.

ALTER TABLE "Payment"           ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Expense"           ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "PaymentSubmission" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_idempotencyKey_key"
  ON "Payment" ("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_idempotencyKey_key"
  ON "Expense" ("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentSubmission_idempotencyKey_key"
  ON "PaymentSubmission" ("idempotencyKey");

CREATE INDEX IF NOT EXISTS "Shipment_arrivedAt_idx"        ON "Shipment" ("arrivedAt");
CREATE INDEX IF NOT EXISTS "Shipment_registeredAt_idx"     ON "Shipment" ("registeredAt");
CREATE INDEX IF NOT EXISTS "Shipment_deliveredAt_idx"      ON "Shipment" ("deliveredAt");
CREATE INDEX IF NOT EXISTS "Shipment_status_arrivedAt_idx" ON "Shipment" ("status", "arrivedAt");
CREATE INDEX IF NOT EXISTS "LedgerEntry_recordedById_occurredAt_idx"
  ON "LedgerEntry" ("recordedById", "occurredAt");

-- Numbers typed in a shape normalisePhone used to mangle. Both should return
-- no rows; anything they do return is two customers who are one person, and
-- merging them is a decision for the desk rather than for this file.
--
--   SELECT id, code, name, phone FROM "Customer"
--    WHERE phone ~ '^\+2550' OR length(phone) > 13;
--   SELECT id, phone FROM "CustomerPhone"
--    WHERE phone ~ '^\+2550' OR length(phone) > 13;
--
-- And customers with no row in the phone list, which createCustomer used to
-- leave behind. scripts/neon-customer-phones.sql backfills them.
--
--   SELECT c.id, c.code, c.phone FROM "Customer" c
--    WHERE NOT EXISTS (SELECT 1 FROM "CustomerPhone" p WHERE p."customerId" = c.id);
