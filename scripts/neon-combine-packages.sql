-- Combine Packages: several of one customer's boxes physically packed into one
-- carton, without losing any of the originals.
--
-- Run once, on the production branch, BEFORE deploying the code that reads it.
--
-- Additive only. Nothing existing is dropped or rewritten: the combination is a
-- new table plus one nullable column on Package, which is what keeps it
-- impossible for a combination to move a weight, a count or a price.
--
-- Run it twice and Postgres simply says the objects already exist; nothing is
-- damaged either way.

CREATE TYPE "CombineStage" AS ENUM ('CHINA', 'DAR');

CREATE TABLE "PackageCombination" (
  "id"             TEXT PRIMARY KEY,
  "reference"      TEXT NOT NULL,
  "customerId"     TEXT NOT NULL,
  "stage"          "CombineStage" NOT NULL,
  "statedWeightKg" DECIMAL(10,3),
  "note"           TEXT,
  "combinedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "combinedById"   TEXT,
  "combinedByName" TEXT,
  "undoneAt"       TIMESTAMP(3),
  "undoneById"     TEXT,
  "undoneReason"   TEXT
);

CREATE UNIQUE INDEX "PackageCombination_reference_key" ON "PackageCombination"("reference");
CREATE INDEX "PackageCombination_customerId_idx" ON "PackageCombination"("customerId");
CREATE INDEX "PackageCombination_combinedAt_idx" ON "PackageCombination"("combinedAt");

ALTER TABLE "PackageCombination" ADD CONSTRAINT "PackageCombination_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackageCombination" ADD CONSTRAINT "PackageCombination_combinedById_fkey" FOREIGN KEY ("combinedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PackageCombination" ADD CONSTRAINT "PackageCombination_undoneById_fkey" FOREIGN KEY ("undoneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Package" ADD COLUMN "combinationId" TEXT;

CREATE INDEX "Package_combinationId_idx" ON "Package"("combinationId");

ALTER TABLE "Package" ADD CONSTRAINT "Package_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "PackageCombination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
