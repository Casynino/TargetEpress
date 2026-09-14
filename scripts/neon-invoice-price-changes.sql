-- Every time a bill's price moved, and who moved it.
--
-- Run this on Neon BEFORE deploying. Plain statements, no DO blocks: the Neon
-- editor splits on semicolons and a DO block has its own inside it.
--
-- Nothing here touches an existing column or row. It adds one enum, one table
-- and two indexes; every invoice keeps the price it has today. There is no
-- unique index and no hold — a bill may collect any number of these over its
-- life, and none of them stops anything.

CREATE TYPE "PriceChangeStatus" AS ENUM ('UNSEEN', 'CONFIRMED', 'REVERTED', 'UNDONE');

CREATE TABLE "InvoicePriceChange" (
  "id"             TEXT PRIMARY KEY,
  "invoiceId"      TEXT NOT NULL,
  "currency"       TEXT NOT NULL,
  "totalBefore"    DECIMAL(12,2) NOT NULL,
  "freightBefore"  DECIMAL(12,2),
  "rateBefore"     DECIMAL(12,2),
  "storageBefore"  DECIMAL(12,2) NOT NULL,
  "otherBefore"    DECIMAL(12,2) NOT NULL,
  "discountBefore" DECIMAL(12,2) NOT NULL,
  "totalAfter"     DECIMAL(12,2) NOT NULL,
  "reason"         TEXT,
  "status"         "PriceChangeStatus" NOT NULL DEFAULT 'UNSEEN',
  "changedById"    TEXT,
  "changedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById"   TEXT,
  "reviewedAt"     TIMESTAMP(3),
  "reviewNote"     TEXT
);

ALTER TABLE "InvoicePriceChange"
  ADD CONSTRAINT "InvoicePriceChange_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoicePriceChange"
  ADD CONSTRAINT "InvoicePriceChange_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoicePriceChange"
  ADD CONSTRAINT "InvoicePriceChange_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InvoicePriceChange_status_changedAt_idx"
  ON "InvoicePriceChange"("status", "changedAt");

CREATE INDEX "InvoicePriceChange_invoiceId_changedAt_idx"
  ON "InvoicePriceChange"("invoiceId", "changedAt");
