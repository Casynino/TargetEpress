-- A price Support has asked Finance to agree.
--
-- Run this on Neon BEFORE deploying. Plain statements, no DO blocks: the Neon
-- editor splits on semicolons and a DO block has its own inside it.
--
-- Nothing here touches an existing column or row. It adds one enum, one table
-- and two indexes; every invoice keeps the price it has today.

CREATE TYPE "PriceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE "InvoicePriceRequest" (
  "id"                    TEXT PRIMARY KEY,
  "invoiceId"             TEXT NOT NULL,
  "freightOverride"       DECIMAL(12,2),
  "clearsFreightOverride" BOOLEAN NOT NULL DEFAULT false,
  "freightRateOverride"   DECIMAL(12,2),
  "storageCharge"         DECIMAL(12,2),
  "otherCharges"          DECIMAL(12,2),
  "reason"                TEXT NOT NULL,
  "currency"              TEXT NOT NULL,
  "totalAtTime"           DECIMAL(12,2) NOT NULL,
  "freightAtTime"         DECIMAL(12,2) NOT NULL,
  "proposedTotal"         DECIMAL(12,2) NOT NULL,
  "status"                "PriceRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById"         TEXT,
  "requestedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById"           TEXT,
  "decidedAt"             TIMESTAMP(3),
  "decisionNote"          TEXT
);

ALTER TABLE "InvoicePriceRequest"
  ADD CONSTRAINT "InvoicePriceRequest_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoicePriceRequest"
  ADD CONSTRAINT "InvoicePriceRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoicePriceRequest"
  ADD CONSTRAINT "InvoicePriceRequest_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InvoicePriceRequest_status_requestedAt_idx"
  ON "InvoicePriceRequest"("status", "requestedAt");

CREATE INDEX "InvoicePriceRequest_invoiceId_status_idx"
  ON "InvoicePriceRequest"("invoiceId", "status");

-- One waiting request per bill. A partial unique index rather than a plain one,
-- because a bill may collect any number of settled requests over its life and
-- only ever one that is still holding it.
CREATE UNIQUE INDEX "InvoicePriceRequest_one_pending_per_invoice"
  ON "InvoicePriceRequest"("invoiceId") WHERE "status" = 'PENDING';
