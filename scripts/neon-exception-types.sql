-- Five more things that can be wrong with an arriving consignment.
--
-- The floor could report six: received, missing, damaged, wrong item, wrong
-- quantity, hold. Everything else went in as "hold" or "other" with the real
-- story in a free-text note, which no list can be filtered by and no report can
-- count. These five are the ones Dar actually meets:
--
--   SHORT_LANDED        left in China for weight, on the next flight. NOT lost
--                       — the customer is told a date, not "we are searching"
--   HELD_BY_CUSTOMS     landed, and the authority is holding it
--   UNIDENTIFIED_CARGO  a box on the floor with no readable marking
--   RESTRICTED_ITEM     something aboard that should never have flown
--   OVER_SHIPPED        more boxes than were booked, which usually means
--                       somebody else's cargo is in this pile
--
-- RUN THIS BEFORE DEPLOYING THE CODE THAT READS IT. Adding a value to an enum
-- touches no row: every ShipmentException already recorded keeps the type it
-- has, and nothing is rewritten.
--
-- NO TRANSACTION. Postgres refuses ALTER TYPE ... ADD VALUE inside a
-- transaction block, so each statement runs on its own — the same shape
-- scripts/neon-review-states.sql uses and says so in its own header.
--
-- Safe to run twice.

ALTER TYPE "ExceptionType" ADD VALUE IF NOT EXISTS 'SHORT_LANDED';
ALTER TYPE "ExceptionType" ADD VALUE IF NOT EXISTS 'HELD_BY_CUSTOMS';
ALTER TYPE "ExceptionType" ADD VALUE IF NOT EXISTS 'UNIDENTIFIED_CARGO';
ALTER TYPE "ExceptionType" ADD VALUE IF NOT EXISTS 'RESTRICTED_ITEM';
ALTER TYPE "ExceptionType" ADD VALUE IF NOT EXISTS 'OVER_SHIPPED';

-- Afterwards all thirteen should be listed:
--
--   SELECT unnest(enum_range(NULL::"ExceptionType"));
