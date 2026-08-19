-- Two verdicts the manager's reconciliation workspace needs and the enum did
-- not carry: FLAGGED (something is wrong beyond the figures) and
-- INFO_REQUESTED (a question asked of the recording desk, nothing disputed).
--
-- ADD VALUE IF NOT EXISTS is idempotent, so this is safe to run twice. Postgres
-- refuses ALTER TYPE ... ADD VALUE inside a transaction block, so each runs on
-- its own.
ALTER TYPE "ReviewState" ADD VALUE IF NOT EXISTS 'FLAGGED';
ALTER TYPE "ReviewState" ADD VALUE IF NOT EXISTS 'INFO_REQUESTED';
