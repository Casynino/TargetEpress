-- ============================================================================
-- A CASH TIN FOR DOLLARS
--
-- Customers pay cash in dollars — some of them always have — and the only cash
-- account on the system held shillings. So a dollar note across the counter had
-- nowhere to land: the clerk could name the USD bank account, which is untrue
-- and unreconcilable, or leave it unattributed, which is money the business
-- cannot see. Neither is a record of what happened.
--
-- One more account, alongside the shilling tin, and both named for the money
-- they hold — the pattern the bank accounts already use, because Tanzania
-- Commercial Bank is two rows for exactly this reason. The shilling tin loses
-- its bare name here: it needed no suffix while it was the only one.
--
-- Additive. It opens empty, and its balance is the ledger added up like every
-- other account's, so there is nothing to reconcile on day one.
--
--   psql "$DATABASE_URL" -f scripts/neon-usd-cash-account.sql
-- ============================================================================

INSERT INTO "CompanyAccount"
  ("id", "code", "name", "kind", "currency", "sortOrder", "active", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'CASH_OFFICE_USD', 'Office cash (USD)', 'CASH', 'USD', 70, true,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Two tins now, so each says which money it holds. Addressed by code, never by
-- display name, so nothing that reads an account is affected.
UPDATE "CompanyAccount"
   SET "name" = 'Office cash (TZS)', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "code" = 'CASH_OFFICE' AND "name" <> 'Office cash (TZS)';

-- Stated rather than left to the INSERT, which does nothing on a re-run: this
-- script has to leave the same two names behind however many times it is run.
UPDATE "CompanyAccount"
   SET "name" = 'Office cash (USD)', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "code" = 'CASH_OFFICE_USD' AND "name" <> 'Office cash (USD)';

SELECT code, name, kind, currency, "sortOrder", active
  FROM "CompanyAccount"
 ORDER BY "sortOrder", name;
