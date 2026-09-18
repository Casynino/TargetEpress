-- Husnater's loan to the company, as an account the expense forms can name.
--
-- Run on Neon AFTER the code that knows about loans is deployed (see
-- neon-loans.sql for why the order matters). Safe to run twice.
--
-- In shillings, because that is the money he lends. Stamped as opened so the
-- accounts page never asks for an opening balance: a loan starts at nothing
-- owed, and debt from before today is recorded as the costs he actually paid,
-- on the days he paid them. Sorted last, so no form that picks the first
-- account in a list can ever pick this one.

INSERT INTO "CompanyAccount"
  ("id", "code", "name", "kind", "currency", "accountName", "sortOrder", "active", "openingSetAt", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'LOAN_HUSNATER', 'Loan — Husnater', 'LOAN', 'TZS', 'Husnater', 900, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
