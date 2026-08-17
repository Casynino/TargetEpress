-- The consignment's paperwork: one new enum, one new table.
--
-- Purely additive. Nothing existing is altered, no column is dropped and no row
-- is touched, so it is safe to run while the site is up — but it MUST be run
-- against Neon BEFORE the deploy that ships the code, because migrations are not
-- applied automatically here and the cargo page queries this table on every load.
-- Deploy first and every cargo record 500s.
--
-- `prisma db push` would do exactly this; this is the whole of what it would
-- change, written out so it can be read before it is run.

CREATE TYPE "ShipmentDocumentKind" AS ENUM (
  'SUPPLIER_INVOICE',
  'PACKING_LIST',
  'CUSTOMS',
  'DAMAGE',
  'OTHER'
);

CREATE TABLE "ShipmentDocument" (
  "id"           TEXT NOT NULL,
  "shipmentId"   TEXT NOT NULL,
  "kind"         "ShipmentDocumentKind" NOT NULL DEFAULT 'OTHER',
  "label"        TEXT,
  "url"          TEXT NOT NULL,
  "contentType"  TEXT NOT NULL,
  "bytes"        INTEGER NOT NULL,
  "filename"     TEXT,
  "uploadedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShipmentDocument_pkey" PRIMARY KEY ("id")
);

-- Every read is "the paperwork on this consignment, newest first".
CREATE INDEX "ShipmentDocument_shipmentId_createdAt_idx"
  ON "ShipmentDocument" ("shipmentId", "createdAt");

-- Cascades with the cargo: a purge already destroys the photos and the packages,
-- and paperwork for a consignment that no longer exists can never be matched to
-- anything again.
ALTER TABLE "ShipmentDocument"
  ADD CONSTRAINT "ShipmentDocument_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The uploader may leave the company; the file they filed does not leave with
-- them, so the name goes null and the document stays.
ALTER TABLE "ShipmentDocument"
  ADD CONSTRAINT "ShipmentDocument_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
