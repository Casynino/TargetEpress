-- Compensation payouts join the general ledger (2026-08-21).
--
-- Compensation gains the account the payout left. The ledger line written by
-- recordCompensation is the authority on the money; this column is what lets
-- the form pre-fill on amend and the case card name the account.
--
-- Run against Neon BEFORE deploying the code that writes it:
--   /opt/homebrew/opt/libpq/bin/psql "<NEON_URL>" -f scripts/neon-compensation-account.sql

ALTER TABLE "Compensation" ADD COLUMN IF NOT EXISTS "accountId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Compensation_accountId_fkey'
  ) THEN
    ALTER TABLE "Compensation"
      ADD CONSTRAINT "Compensation_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
