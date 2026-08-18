-- Target Express — the manager's control layer.
-- Run against Neon BEFORE deploying. Safe to re-run.
BEGIN;

DO $$ BEGIN
  CREATE TYPE "ReviewState" AS ENUM ('RECONCILED', 'PENDING', 'MISMATCH', 'UNDER_REVIEW', 'SENT_BACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReviewTarget" AS ENUM ('PAYMENT', 'EXPENSE', 'BATCH', 'LEDGER_ENTRY', 'INVOICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AccountReconciliation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "systemBalance" DECIMAL(14,2) NOT NULL,
    "actualBalance" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "state" "ReviewState" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "checkedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManagerReview" (
    "id" TEXT NOT NULL,
    "target" "ReviewTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "state" "ReviewState" NOT NULL,
    "reason" TEXT,
    "reviewedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AccountReconciliation_accountId_asOf_idx" ON "AccountReconciliation"("accountId", "asOf");

CREATE INDEX IF NOT EXISTS "AccountReconciliation_state_idx" ON "AccountReconciliation"("state");

CREATE INDEX IF NOT EXISTS "ManagerReview_target_targetId_createdAt_idx" ON "ManagerReview"("target", "targetId", "createdAt");

CREATE INDEX IF NOT EXISTS "ManagerReview_state_idx" ON "ManagerReview"("state");

DO $$ BEGIN
  ALTER TABLE "AccountReconciliation" ADD CONSTRAINT "AccountReconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AccountReconciliation" ADD CONSTRAINT "AccountReconciliation_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ManagerReview" ADD CONSTRAINT "ManagerReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
