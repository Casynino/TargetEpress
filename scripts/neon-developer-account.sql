-- DEVELOPER ACCOUNT — the one database migration it needs (additive, idempotent).
--
-- 1) Adds DEVELOPER to the "Role" enum.
-- 2) Makes the developer's audit rows APPEND-ONLY in the database itself: any
--    UPDATE or DELETE on one raises an error, so even a bug, or a careless
--    script run with the database's own keys, cannot rewrite or erase what the
--    developer account did. A row is the developer's if its action starts with
--    "developer." or its metadata carries developer = true. Every other audit
--    row behaves exactly as before.
--
-- Touches no existing row and no column. Safe to run before or after the code
-- deploy, and safe to run twice. Run it on Neon BEFORE creating the account:
--
--   npx prisma db execute --url "postgresql://…neon…?sslmode=require" --file scripts/neon-developer-account.sql
--
-- (The enum change must stand on its own: Postgres will not let a new enum
-- value be used in the transaction that created it, and prisma db execute runs
-- each statement separately.)

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEVELOPER';

CREATE OR REPLACE FUNCTION tx_protect_developer_audit() RETURNS trigger AS $fn$
BEGIN
  IF OLD."action" LIKE 'developer.%' OR (OLD."metadata" ->> 'developer') = 'true' THEN
    RAISE EXCEPTION 'Developer audit records are append-only (% blocked)', TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tx_protect_developer_audit_trg ON "AuditLog";
CREATE TRIGGER tx_protect_developer_audit_trg
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION tx_protect_developer_audit();
