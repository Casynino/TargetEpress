-- The unit an agreed rate is in, when it is not the rate book's own.
--
-- Run this on Neon BEFORE deploying. Nullable columns only; every existing bill
-- keeps its price and reads as "the book's unit", which is what they all are
-- today. Nothing is rewritten.

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "freightRateMethod" "PricingMethod";

-- And what that rate was multiplied by, kilos or pieces, so the bill and the
-- PDF print the same working that produced the freight.
ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "freightRateQuantity" DECIMAL(10,3);

-- And the unit an agreed rate was in before a price change, so putting the
-- change back restores the same price rather than the same number in another
-- unit.
ALTER TABLE "InvoicePriceChange"
  ADD COLUMN IF NOT EXISTS "methodBefore" "PricingMethod";

-- And what that rate was multiplied by, so putting a change back reproduces
-- the freight exactly even after the cargo was re-weighed.
ALTER TABLE "InvoicePriceChange"
  ADD COLUMN IF NOT EXISTS "quantityBefore" DECIMAL(10,3);
