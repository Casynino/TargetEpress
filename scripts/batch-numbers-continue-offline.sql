-- Continue the batch numbering from the books this system replaced.
--
-- Guangzhou had reached GZ-30 and Hong Kong HK-15 before any of this existed.
-- The system started its own runs at one, so the office had a paper GZ-31 and
-- a screen calling the same era's flights GZ-0001 — two names for one year of
-- loads. The runs move onto the numbers the office is already using:
--
--   GZ-0001 -> GZ-31     HK-0001 -> HK-16
--   GZ-0002 -> GZ-32     next new HK is HK-17
--   next new GZ is GZ-33
--
-- Expressed as a shift rather than a list, so it is right for any batch that
-- exists at the time it runs: every Guangzhou batch moves up 30, every Hong
-- Kong batch up 15. The two permanent loading tables (GZ-LOADING, HK-LOADING)
-- carry no number and are not touched.
--
-- WHAT THIS DOES NOT TOUCH. Tracking numbers, and the counter behind them.
-- TX-000345 is quoted on paperwork, in WhatsApp threads and by customers on
-- the phone, and nothing here goes near it. Nor does anything else move:
-- batchNumber lives on the Batch row alone — no other table stores a copy —
-- so cargo, invoices, payments, ledger lines and customer tracking all follow
-- the batch by its id and see the new name without being rewritten.
--
-- The audit log keeps whatever it recorded at the time. It is append-only, and
-- a line that says a flight was called GZ-0001 in August is a true record of
-- August.
--
-- Safe to run twice: the shift only applies to numbers still in the old
-- zero-padded shape, and the counters are set rather than incremented.

BEGIN;

-- Longest first, so an update never collides with a number it is about to
-- create. With the +30 and +15 shifts these cannot overlap anyway (the old
-- run stops at 2), but the ordering costs nothing and the unique index on
-- batchNumber is unforgiving.
UPDATE "Batch"
   SET "batchNumber" = 'GZ-' || (substring("batchNumber" from 4)::int + 30)::text
 WHERE "permanent" = false
   AND "batchNumber" ~ '^GZ-0[0-9]{3,}$';

UPDATE "Batch"
   SET "batchNumber" = 'HK-' || (substring("batchNumber" from 4)::int + 15)::text
 WHERE "permanent" = false
   AND "batchNumber" ~ '^HK-0[0-9]{3,}$';

-- The counters the next batch is minted from. nextSequence increments first
-- and returns the new value, so 32 yields GZ-33 and 16 yields HK-17.
--
-- Taken as the HIGHEST of three numbers rather than set to the target:
--
--   the target itself      — the office's own run, GZ-32 / HK-16
--   the counter as it is   — a flight dispatched between this being written
--                            and being run has already taken a number
--   the highest batch here — the shift moves real batches, and a counter
--                            below one of them would mint a name that already
--                            exists and fail on the unique index
--
-- The last of those is the one that bites: it is not hypothetical on any
-- database whose run had gone past the target before this ran.
INSERT INTO "Counter" ("key", "value")
SELECT 'batch:GZ', GREATEST(
         32,
         COALESCE((SELECT MAX(substring("batchNumber" from 4)::int)
                     FROM "Batch"
                    WHERE "permanent" = false
                      AND "batchNumber" ~ '^GZ-[0-9]+$'), 0))
  ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST("Counter"."value", EXCLUDED."value");

INSERT INTO "Counter" ("key", "value")
SELECT 'batch:HK', GREATEST(
         16,
         COALESCE((SELECT MAX(substring("batchNumber" from 4)::int)
                     FROM "Batch"
                    WHERE "permanent" = false
                      AND "batchNumber" ~ '^HK-[0-9]+$'), 0))
  ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST("Counter"."value", EXCLUDED."value");

COMMIT;

-- Afterwards these should read GZ-31, GZ-32, HK-16 and the two loading tables,
-- with batch:GZ = 32, batch:HK = 16, and shipment untouched:
--
--   SELECT "batchNumber", origin, status FROM "Batch" ORDER BY "batchNumber";
--   SELECT key, value FROM "Counter" WHERE key LIKE 'batch%' OR key = 'shipment';
