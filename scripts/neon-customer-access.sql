-- ============================================================================
-- SUSPENDING AND REMOVING A CUSTOMER
--
-- The Developer can suspend a customer (no new cargo, no handover until it is
-- lifted) and remove one from the system (leaves the list, the search and the
-- pickers; every cargo record, bill and payment stays under their name).
-- Two nullable timestamps on Customer say so.
--
-- Additive and safe on live data: nothing is moved or rewritten, and every
-- existing customer simply has both columns empty.
--
--   psql "$DATABASE_URL" -f scripts/neon-customer-access.sql
-- ============================================================================

BEGIN;

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);

COMMIT;
