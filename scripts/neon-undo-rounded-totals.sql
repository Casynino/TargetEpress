-- ============================================================================
-- PUT THE BILLS BACK ON THE PRICE LIST
--
-- For about three hours on 3 September 2026, invoice totals were rounded to
-- whole dollars. The rate book is written in half-dollars — normal goods are
-- $13.50/kg — so a 0.3 kg parcel, billed at the 1 kg minimum, came out at $14
-- instead of $13.50, and every rate ending in .50 rounded with it. The rounding
-- was removed from the code, but the figures raised while it was live are
-- STORED, so they did not move.
--
-- This restores each affected total to the exact rate-book sum:
--
--     total = freight (override, or the rate book) + storage + other - discount
--
-- which is the arithmetic every one of these bills would have had yesterday and
-- will have tomorrow. `freightCost` was never rounded, so it is the untouched
-- record of what the price list said, and that is what this reads.
--
-- ONLY BILLS NOBODY HAS ACTED ON. A total is not changed underneath a payment
-- or a released consignment: the customer paid what they were shown, and moving
-- the figure afterwards turns a settled bill into a debt of fifty cents. At the
-- time of writing all 69 are UNPAID with nothing against them, and the WHERE
-- clause enforces it rather than trusting that.
--
--   psql "$DATABASE_URL" -f scripts/neon-undo-rounded-totals.sql
-- ============================================================================

BEGIN;

-- What is about to change, for the record.
CREATE TEMP TABLE fixing AS
SELECT i."id",
       i."invoiceNumber",
       i."total" AS was,
       (COALESCE(i."freightOverride", i."freightCost")
        + i."storageCharge" + i."otherCharges" - i."discount") AS should_be
  FROM "Invoice" i
 WHERE i."status" = 'UNPAID'
   AND i."amountPaid" = 0
   AND NOT EXISTS (SELECT 1 FROM "PickupNote" p WHERE p."shipmentId" = i."shipmentId")
   AND abs(i."total" - (COALESCE(i."freightOverride", i."freightCost")
        + i."storageCharge" + i."otherCharges" - i."discount")) > 0.004;

UPDATE "Invoice" i
   SET "total" = f.should_be,
       -- The shilling figure follows the dollar one, at the rate frozen onto
       -- this bill. Never today's: the customer was quoted that rate.
       "totalLocal" = CASE
         WHEN i."exchangeRate" IS NULL THEN i."totalLocal"
         ELSE round(f.should_be * i."exchangeRate")
       END
  FROM fixing f
 WHERE i."id" = f."id";

-- The trail. A figure on 69 customers' bills moved, and the record has to say
-- who moved it and why.
INSERT INTO "AuditLog" ("id", "action", "entity", "summary", "metadata", "createdAt")
SELECT
  gen_random_uuid()::text,
  'invoice.reprice',
  'Invoice',
  'Restored ' || count(*) || ' bill(s) to the rate book after whole-dollar '
    || 'rounding was withdrawn — net ' || to_char(sum(was - should_be), 'FM990.00')
    || ' USD returned to customers',
  jsonb_build_object(
    'reason', 'Totals were rounded to whole dollars for about three hours on 3 Sep 2026. The rate book is written in half-dollars, so a 1 kg minimum charge read 14.00 instead of 13.50.',
    'bills', count(*),
    'netUsd', sum(was - should_be),
    'invoices', jsonb_agg(jsonb_build_object('invoice', "invoiceNumber", 'was', was, 'now', should_be) ORDER BY "invoiceNumber")
  ),
  CURRENT_TIMESTAMP
  FROM fixing
 HAVING count(*) > 0;

SELECT count(*) AS bills_corrected,
       to_char(sum(was - should_be), 'FM990.00') AS net_usd_returned
  FROM fixing;

COMMIT;
