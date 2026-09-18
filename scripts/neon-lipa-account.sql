-- Lipa: M-Pesa and Mixx by Yas as one account at the office.
--
-- Safe to run before or after the deploy that brings the Close account
-- button, and safe to run twice. It only adds the new account; it does not
-- touch Vodacom M-Pesa or Mixx by Yas. Those are closed from the app — open
-- each one on Finance → Accounts and use "Close this account", choosing Lipa —
-- which moves their money into Lipa as a transfer on the register, points any
-- waiting claims, unpaid costs and payroll at Lipa, and takes them off every
-- staff screen while keeping their history.
--
-- Customers are not affected: the public site, invoices and messages keep
-- listing the M-Pesa and Mixx Lipa numbers separately.
--
-- Stamped as opened, so the Accounts page does not ask for an opening balance:
-- Lipa starts at nothing and is filled by the two closing transfers.

INSERT INTO "CompanyAccount"
  ("id", "code", "name", "kind", "currency", "institution", "accountNumber", "accountName", "sortOrder", "active", "openingSetAt", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'LIPA', 'Lipa', 'MOBILE_MONEY', 'TZS', 'M-Pesa & Mixx by Yas', '5581590 / 7122055', 'TARGET EXPRESS AIR CARGO', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
