-- Vodacom M-Pesa and Mixx by Yas become Lipa: every record moves, then the
-- two old accounts are deleted.
--
-- The owner's instruction (18 Sep 2026): move everything ever recorded against
-- the two mobile-money accounts onto Lipa, exactly as it is, and delete them —
-- so there is one account and no duplicate. Amounts, dates, descriptions,
-- receipts and who recorded what are not touched; only which account each
-- record points at. No transfer is posted: nothing moved, it was always the
-- same money.
--
-- Run on Neon AFTER scripts/neon-lipa-account.sql (Lipa must exist). Do NOT
-- press "Close this account" on M-Pesa or Mixx — this replaces that.
--
-- Two statements. The first moves everything at once (all or nothing) and
-- writes the audit log entry. The second deletes the two accounts, and can
-- only succeed once nothing points at them any more. Safe to run twice.
--
-- Which account each moved record came from is kept in that audit log entry
-- (row ids grouped by M-Pesa / Mixx), since the Account column will say Lipa.
--
-- Customers are not affected: the website, invoices and messages keep listing
-- the M-Pesa and Mixx Lipa numbers separately. A receipt printed again from
-- now on says "Into: Lipa".

-- 1. Move every record to Lipa, and record what moved.
WITH
lipa AS (SELECT "id" FROM "CompanyAccount" WHERE "code" = 'LIPA'),
old AS (SELECT "id", "code" FROM "CompanyAccount" WHERE "code" IN ('MPESA', 'MIXX')),

-- Read before anything changes: what is about to move, and from which account.
was_ledger AS (SELECT e."id", o."code" FROM "LedgerEntry" e JOIN old o ON o."id" = e."accountId"),
was_payment AS (
  SELECT p."id", o."code", 'landed' AS "field" FROM "Payment" p JOIN old o ON o."id" = p."accountId"
  UNION ALL
  SELECT p."id", o."code", 'fare' FROM "Payment" p JOIN old o ON o."id" = p."transportSourceId"
),
was_claim AS (
  SELECT s."id", o."code", 'landed' AS "field" FROM "PaymentSubmission" s JOIN old o ON o."id" = s."accountId"
  UNION ALL
  SELECT s."id", o."code", 'fare' FROM "PaymentSubmission" s JOIN old o ON o."id" = s."transportSourceId"
),
was_transfer AS (
  SELECT t."id", o."code", 'from' AS "field" FROM "AccountTransfer" t JOIN old o ON o."id" = t."fromAccountId"
  UNION ALL
  SELECT t."id", o."code", 'to' FROM "AccountTransfer" t JOIN old o ON o."id" = t."toAccountId"
),
was_expense AS (SELECT x."id", o."code" FROM "Expense" x JOIN old o ON o."id" = x."accountId"),
was_payroll AS (SELECT r."id", o."code" FROM "PayrollRun" r JOIN old o ON o."id" = r."accountId"),
was_comp AS (SELECT c."id", o."code" FROM "Compensation" c JOIN old o ON o."id" = c."accountId"),
was_loan AS (SELECT m."id", o."code" FROM "LoanMovement" m JOIN old o ON o."id" = m."accountId"),
was_check AS (SELECT r."id", o."code" FROM "AccountReconciliation" r JOIN old o ON o."id" = r."accountId"),
was_count AS (SELECT c."id", o."code" FROM "CashCount" c JOIN old o ON o."id" = c."accountId"),

-- The moves: one UPDATE per table, so a record pointing at an old account
-- twice (a payment that landed in M-Pesa with its fare paid from M-Pesa) is
-- moved once.
m_ledger AS (
  UPDATE "LedgerEntry" SET "accountId" = (SELECT "id" FROM lipa)
  WHERE "accountId" IN (SELECT "id" FROM old) RETURNING 1
),
m_payment AS (
  UPDATE "Payment" SET
    "accountId" = CASE WHEN "accountId" IN (SELECT "id" FROM old) THEN (SELECT "id" FROM lipa) ELSE "accountId" END,
    "transportSourceId" = CASE WHEN "transportSourceId" IN (SELECT "id" FROM old) THEN (SELECT "id" FROM lipa) ELSE "transportSourceId" END
  WHERE "accountId" IN (SELECT "id" FROM old) OR "transportSourceId" IN (SELECT "id" FROM old) RETURNING 1
),
m_claim AS (
  UPDATE "PaymentSubmission" SET
    "accountId" = CASE WHEN "accountId" IN (SELECT "id" FROM old) THEN (SELECT "id" FROM lipa) ELSE "accountId" END,
    "transportSourceId" = CASE WHEN "transportSourceId" IN (SELECT "id" FROM old) THEN (SELECT "id" FROM lipa) ELSE "transportSourceId" END
  WHERE "accountId" IN (SELECT "id" FROM old) OR "transportSourceId" IN (SELECT "id" FROM old) RETURNING 1
),
m_transfer AS (
  UPDATE "AccountTransfer" SET
    "fromAccountId" = CASE WHEN "fromAccountId" IN (SELECT "id" FROM old) THEN (SELECT "id" FROM lipa) ELSE "fromAccountId" END,
    "toAccountId" = CASE WHEN "toAccountId" IN (SELECT "id" FROM old) THEN (SELECT "id" FROM lipa) ELSE "toAccountId" END
  WHERE "fromAccountId" IN (SELECT "id" FROM old) OR "toAccountId" IN (SELECT "id" FROM old) RETURNING 1
),
m_expense AS (
  UPDATE "Expense" SET "accountId" = (SELECT "id" FROM lipa)
  WHERE "accountId" IN (SELECT "id" FROM old) RETURNING 1
),
m_payroll AS (
  UPDATE "PayrollRun" SET "accountId" = (SELECT "id" FROM lipa)
  WHERE "accountId" IN (SELECT "id" FROM old) RETURNING 1
),
m_comp AS (
  UPDATE "Compensation" SET "accountId" = (SELECT "id" FROM lipa)
  WHERE "accountId" IN (SELECT "id" FROM old) RETURNING 1
),
m_loan AS (
  UPDATE "LoanMovement" SET "accountId" = (SELECT "id" FROM lipa)
  WHERE "accountId" IN (SELECT "id" FROM old) RETURNING 1
),
m_check AS (
  UPDATE "AccountReconciliation" SET "accountId" = (SELECT "id" FROM lipa)
  WHERE "accountId" IN (SELECT "id" FROM old) RETURNING 1
),
m_count AS (
  UPDATE "CashCount" SET "accountId" = (SELECT "id" FROM lipa)
  WHERE "accountId" IN (SELECT "id" FROM old) RETURNING 1
)

INSERT INTO "AuditLog" ("id", "action", "entity", "entityId", "summary", "metadata", "createdAt")
SELECT
  gen_random_uuid()::text,
  'account.merge',
  'CompanyAccount',
  (SELECT "id" FROM lipa),
  'Vodacom M-Pesa and Mixx by Yas merged into Lipa, every record as it was: '
    || (SELECT count(*) FROM m_ledger) || ' ledger lines, '
    || (SELECT count(*) FROM m_payment) || ' payments, '
    || (SELECT count(*) FROM m_claim) || ' payment claims, '
    || (SELECT count(*) FROM m_transfer) || ' transfers, '
    || (SELECT count(*) FROM m_expense) || ' costs, '
    || (SELECT count(*) FROM m_payroll) || ' payroll runs, '
    || (SELECT count(*) FROM m_comp) || ' compensation payouts, '
    || (SELECT count(*) FROM m_loan) || ' loan movements, '
    || (SELECT count(*) FROM m_check) || ' balance checks moved',
  jsonb_build_object(
    'into', 'LIPA',
    'ledgerEntries', (SELECT coalesce(jsonb_object_agg("code", ids), '{}'::jsonb) FROM (SELECT "code", jsonb_agg("id") AS ids FROM was_ledger GROUP BY "code") g),
    'payments', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', "id", 'from', "code", 'field', "field")), '[]'::jsonb) FROM was_payment),
    'claims', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', "id", 'from', "code", 'field', "field")), '[]'::jsonb) FROM was_claim),
    'transfers', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', "id", 'from', "code", 'side', "field")), '[]'::jsonb) FROM was_transfer),
    'expenses', (SELECT coalesce(jsonb_object_agg("code", ids), '{}'::jsonb) FROM (SELECT "code", jsonb_agg("id") AS ids FROM was_expense GROUP BY "code") g),
    'payrollRuns', (SELECT coalesce(jsonb_object_agg("code", ids), '{}'::jsonb) FROM (SELECT "code", jsonb_agg("id") AS ids FROM was_payroll GROUP BY "code") g),
    'compensations', (SELECT coalesce(jsonb_object_agg("code", ids), '{}'::jsonb) FROM (SELECT "code", jsonb_agg("id") AS ids FROM was_comp GROUP BY "code") g),
    'loanMovements', (SELECT coalesce(jsonb_object_agg("code", ids), '{}'::jsonb) FROM (SELECT "code", jsonb_agg("id") AS ids FROM was_loan GROUP BY "code") g),
    'balanceChecks', (SELECT coalesce(jsonb_object_agg("code", ids), '{}'::jsonb) FROM (SELECT "code", jsonb_agg("id") AS ids FROM was_check GROUP BY "code") g),
    'cashCounts', (SELECT coalesce(jsonb_object_agg("code", ids), '{}'::jsonb) FROM (SELECT "code", jsonb_agg("id") AS ids FROM was_count GROUP BY "code") g)
  ),
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM lipa) AND EXISTS (SELECT 1 FROM old);

-- 2. Delete the two emptied accounts. Refused by the database if anything
--    still points at them, so it cannot delete an account that holds records.
DELETE FROM "CompanyAccount"
 WHERE "code" IN ('MPESA', 'MIXX')
   AND EXISTS (SELECT 1 FROM "CompanyAccount" WHERE "code" = 'LIPA');
