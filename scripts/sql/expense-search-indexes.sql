-- Composite indexes for the Expenses page, which always filters then sorts.
--
-- The page narrows to a status, a category, a class or a batch and then orders
-- by the day the cost was incurred. The existing single-column indexes serve
-- one half of that or the other, so a busy month became a scan followed by a
-- sort. These serve both halves at once.
--
-- Purely additive: no column changes, no data touched, safe to run while the
-- site is up. CONCURRENTLY so the table is never locked against writes — note
-- that each statement must be run on its own, outside a transaction.
--
-- Already applied to the local database by `prisma db push`. Run this against
-- Neon once; `prisma db push` would do the same, but this is the whole of what
-- it would change, written out so it can be read before it is run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_status_incurredAt_idx"
  ON public."Expense" USING btree (status, "incurredAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_category_incurredAt_idx"
  ON public."Expense" USING btree (category, "incurredAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_expenseClass_incurredAt_idx"
  ON public."Expense" USING btree ("expenseClass", "incurredAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Expense_batchId_incurredAt_idx"
  ON public."Expense" USING btree ("batchId", "incurredAt");
