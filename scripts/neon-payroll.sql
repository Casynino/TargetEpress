-- Target Express — payroll tables + the staff salary column.
-- Run this against Neon BEFORE deploying. Safe to re-run: every statement is guarded.
BEGIN;

DO $$ BEGIN
  CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "baseSalary" DECIMAL(12,2);

CREATE TABLE IF NOT EXISTS "PayrollRun" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "preparedById" TEXT NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "accountId" TEXT,
    "expenseId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PayrollItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "employeeId" TEXT,
    "gross" DECIMAL(12,2) NOT NULL,
    "allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(12,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_code_key" ON "PayrollRun"("code");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_expenseId_key" ON "PayrollRun"("expenseId");

CREATE INDEX IF NOT EXISTS "PayrollRun_status_idx" ON "PayrollRun"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_year_month_key" ON "PayrollRun"("year", "month");

CREATE INDEX IF NOT EXISTS "PayrollItem_runId_idx" ON "PayrollItem"("runId");

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollItem_runId_userId_key" ON "PayrollItem"("runId", "userId");

DO $$ BEGIN
  ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CompanyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
