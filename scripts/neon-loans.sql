-- Borrowed money: a lender's account, and the record of money borrowed and repaid.
--
-- Run on Neon BEFORE deploying the code that reads it. Nothing here writes a
-- row: the new values are harmless to the running site until something uses
-- them, and the loan account itself is created by neon-loan-husnater.sql AFTER
-- the deploy — an account of kind LOAN read by code that does not know the
-- value would break every page that lists accounts.
--
-- Every statement is safe to run twice except the first. If it says the type
-- already exists, it has already run — carry on with the rest.

CREATE TYPE "LoanMovementKind" AS ENUM ('RECEIVED', 'REPAID');

ALTER TYPE "AccountKind" ADD VALUE IF NOT EXISTS 'LOAN';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'LOAN_RECEIVED';
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'LOAN_REPAYMENT';

CREATE TABLE IF NOT EXISTS "LoanMovement" (
  "id" TEXT NOT NULL,
  "movementNumber" TEXT NOT NULL,
  "kind" "LoanMovementKind" NOT NULL,
  "loanAccountId" TEXT NOT NULL REFERENCES "CompanyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountId" TEXT NOT NULL REFERENCES "CompanyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "recordedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT,
  CONSTRAINT "LoanMovement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LoanMovement_movementNumber_key" ON "LoanMovement"("movementNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "LoanMovement_idempotencyKey_key" ON "LoanMovement"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "LoanMovement_loanAccountId_occurredAt_idx" ON "LoanMovement"("loanAccountId", "occurredAt");
CREATE INDEX IF NOT EXISTS "LoanMovement_accountId_idx" ON "LoanMovement"("accountId");

ALTER TABLE "LedgerEntry"
  ADD COLUMN IF NOT EXISTS "loanMovementId" TEXT
  REFERENCES "LoanMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "LedgerEntry_loanMovementId_direction_key"
  ON "LedgerEntry"("loanMovementId", "direction");
