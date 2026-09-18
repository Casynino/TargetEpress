-- Lipa: M-Pesa and Mixx by Yas as one account at the office.
--
-- Safe to run twice. It only adds the new account. Vodacom M-Pesa and Mixx
-- by Yas are then merged into it, every record as it was, and deleted, by
-- scripts/neon-merge-into-lipa.sql.
--
-- Customers are not affected: the public site, invoices and messages keep
-- listing the M-Pesa and Mixx Lipa numbers separately.
--
-- Stamped as opened, so the Accounts page does not ask for an opening balance:
-- Lipa's history, opening balances included, is what M-Pesa and Mixx bring.

INSERT INTO "CompanyAccount"
  ("id", "code", "name", "kind", "currency", "institution", "accountNumber", "accountName", "sortOrder", "active", "openingSetAt", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'LIPA', 'Lipa', 'MOBILE_MONEY', 'TZS', 'M-Pesa & Mixx by Yas', '5581590 / 7122055', 'TARGET EXPRESS AIR CARGO', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
