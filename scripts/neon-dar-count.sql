-- WHAT DAR COUNTS AT CHECK-IN, AND WHAT CHINA HAD SAID.
--
-- Run on Neon BEFORE the code that reads these columns is deployed. The app
-- selects them on the receiving screen and on the cargo record, so a deploy
-- that lands first answers every one of those pages with an error.
--
-- Seven columns and one type. Nothing is dropped, nothing is rewritten, and
-- every column is nullable — existing cargo simply has nothing recorded
-- against it, which is the truth: nobody asked those questions at the time.
--
--   pieces            what is inside the boxes; never priced on
--   declared*         what Guangzhou said, frozen the moment Dar writes its
--                     own figure over the live column
--   condition         good / minor damage / damaged / wet / repacked
--   shelfLocation     where the box is standing in the warehouse
--
-- Safe to run twice.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CargoCondition') THEN
    CREATE TYPE "CargoCondition" AS ENUM ('GOOD', 'MINOR_DAMAGE', 'DAMAGED', 'WET', 'REPACKED');
  END IF;
END
$$;

ALTER TABLE "Shipment"
  ADD COLUMN IF NOT EXISTS "pieces" INTEGER,
  ADD COLUMN IF NOT EXISTS "declaredPackages" INTEGER,
  ADD COLUMN IF NOT EXISTS "declaredPieces" INTEGER,
  ADD COLUMN IF NOT EXISTS "declaredWeightKg" DECIMAL(10,3),
  ADD COLUMN IF NOT EXISTS "declaredVolumeCbm" DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS "condition" "CargoCondition",
  ADD COLUMN IF NOT EXISTS "shelfLocation" TEXT;
