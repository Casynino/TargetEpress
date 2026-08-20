-- FRESH START, 20 AUG 2026, at the owner's instruction:
--
--   "the batches that i was having before and all the data that i was doing
--    was just testing... keep those two batches in china... wipe everything
--    and those two batches now they should start as first two batches...
--    delete everything even the customers from before."
--
-- WHAT SURVIVES: the two permanent loading tables (GZ-LOADING, HK-LOADING) and
-- every consignment on them — the real cargo China is registering now — with
-- their customers, packages, photos, status histories and edit histories. The
-- two consignments deleted on those tables this week survive AS deleted
-- history, which is what the owner said deletion should mean. Users, company
-- accounts, cargo types, the rate book, exchange rates, markets, settings and
-- the audit log all stay: they are configuration and history, not test data.
--
-- WHAT GOES: the three flown test batches and their 82 consignments, all 82
-- invoices, every payment, receipt, ledger line, expense, pickup note,
-- statement, review and submission — and every customer no surviving
-- consignment references.
--
-- COUNTERS for the wiped registers reset to zero, so the real era starts at
-- GZ-0001 and INV-2026-000001. The shipment and customer counters do NOT
-- reset: surviving cargo already carries TX- numbers and CUS- codes, and a
-- reset would hand their numbers out twice.
--
-- A full pg_dump was taken immediately before this ran:
-- backups/pre-wipe-2026-08-20.sql (kept out of git — it holds customer data).

BEGIN;

-- REFUSE TO RUN AGAINST A DATABASE THAT LACKS THE TWO KEPT TABLES. The local
-- rehearsal had none and correctly wiped to zero — production must never be
-- able to do that through a mis-aimed connection string.
DO $$ BEGIN
  IF (SELECT count(*) FROM "Batch" WHERE permanent) <> 2 THEN
    RAISE EXCEPTION 'Expected exactly the two permanent loading tables; found a different database. Refusing.';
  END IF;
END $$;

CREATE TEMP TABLE doomed_shipments AS
  SELECT s.id, s."customerId"
  FROM "Shipment" s
  LEFT JOIN "Batch" b ON b.id = s."batchId"
  WHERE b.id IS NULL OR NOT b.permanent;

-- Money and process records: all of it is test-era, none touches kept cargo
-- (verified before running: 0 invoices, 0 verifications on the kept tables).
DELETE FROM "LedgerEntry";
DELETE FROM "Receipt";
DELETE FROM "PaymentProof";
DELETE FROM "Payment";
DELETE FROM "PaymentSubmission";
-- Payroll runs reference the expense they booked, so they go first. (None on
-- production at the time of writing; the order is correct either way.)
DELETE FROM "PayrollItem";
DELETE FROM "PayrollRun";
DELETE FROM "ExpenseReceipt";
DELETE FROM "Expense";
-- Delivery records hold their pickup note under RESTRICT, so they go first.
DELETE FROM "DeliveryRecord";
DELETE FROM "PickupNote";
DELETE FROM "Invoice";
DELETE FROM "BatchStatement";
DELETE FROM "ManagerReview";
DELETE FROM "AccountReconciliation";
DELETE FROM "AccountTransfer";
DELETE FROM "CashCount";
DELETE FROM "Notification";
DELETE FROM "BatchVerification";
DELETE FROM "SourcingRequest";
DELETE FROM "Compensation";
DELETE FROM "ExceptionEvent";
DELETE FROM "ShipmentException";
DELETE FROM "TicketNote";
DELETE FROM "SupportTicket";
DELETE FROM "BookingRequest";
DELETE FROM "PickupRequest";

-- The test cargo itself, children first.
DELETE FROM "FieldChange" WHERE "entityId" IN (SELECT id FROM doomed_shipments);
DELETE FROM "Package" WHERE "shipmentId" IN (SELECT id FROM doomed_shipments);
DELETE FROM "ShipmentPhoto" WHERE "shipmentId" IN (SELECT id FROM doomed_shipments);
DELETE FROM "ShipmentStatusHistory" WHERE "shipmentId" IN (SELECT id FROM doomed_shipments);
DELETE FROM "ShipmentDocument" WHERE "shipmentId" IN (SELECT id FROM doomed_shipments);
DELETE FROM "Shipment" WHERE id IN (SELECT id FROM doomed_shipments);

-- The flown test batches. The two loading tables are permanent and stay.
DELETE FROM "Batch" WHERE NOT permanent;

-- Customers nothing surviving refers to.
CREATE TEMP TABLE doomed_customers AS
  SELECT c.id FROM "Customer" c
  WHERE NOT EXISTS (SELECT 1 FROM "Shipment" s WHERE s."customerId" = c.id);
DELETE FROM "CustomerMessage" WHERE "customerId" IN (SELECT id FROM doomed_customers);
DELETE FROM "FieldChange" WHERE "entityId" IN (SELECT id FROM doomed_customers);
DELETE FROM "Customer" WHERE id IN (SELECT id FROM doomed_customers);

-- The wiped registers start again at one; cargo and customer numbering do not.
UPDATE "Counter" SET value = 0 WHERE key IN (
  'batch:GZ', 'batch:HK', 'dispatch:GZ:2026', 'invoice:2026', 'expense:2026',
  'ledger:2026', 'pickup:2026', 'receipt:2026', 'submission:2026',
  'executive:2026', 'sourcing:2026'
);

-- Say what happened before it becomes permanent.
SELECT 'batches left' AS what, count(*)::text FROM "Batch"
UNION ALL SELECT 'shipments left', count(*)::text FROM "Shipment"
UNION ALL SELECT 'customers left', count(*)::text FROM "Customer"
UNION ALL SELECT 'invoices left', count(*)::text FROM "Invoice"
UNION ALL SELECT 'ledger left', count(*)::text FROM "LedgerEntry"
UNION ALL SELECT 'payments left', count(*)::text FROM "Payment"
UNION ALL SELECT 'expenses left', count(*)::text FROM "Expense";

COMMIT;
