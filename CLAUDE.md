# Target Express Air Cargo

Air cargo ERP: Guangzhou / Hong Kong → Dar es Salaam. **This is a live business.** Real staff record real money in it every day, so a wrong figure on a screen is a wrong figure in somebody's books.

- Live: `target-epress.vercel.app` and `www.targetexpressaircargo.com`
- Repo: `Casynino/TargetEpress` — Vercel deploys automatically from `main`
- Database: Neon (`ep-quiet-salad`). **Push schema changes to Neon by hand BEFORE deploying code that reads them**, or production breaks on the next request.

## Stack

Next.js 15 App Router · React 19 (RSC + server actions) · Prisma 6 · Postgres · Tailwind · NextAuth.

## Rules that are not negotiable

**Every `"use server"` export is a public endpoint.** It must call `authorize(...)` itself. A control that is merely unrendered is not a permission — the action is reachable without the button, so guard both.

**Money is always derived, never stored.** Outstanding = `total − amountPaid`, computed at read time. There is no stored balance anywhere, and that is why no figure has ever drifted.

**Sum money as `COALESCE(creditedAmount, amount)`** — never `creditedAmount` alone. Older USD payments have a null credited column and silently count as zero otherwise.

**The ledger is append-only.** A wrong line is answered by a reversing line pointing back at it (`reversesId`), never edited or deleted.

**A credit sale posts NO ledger entry.** Nothing reached an account, so nothing may be counted as cash. Receivables are derived.

**Concurrency idiom:** re-state the condition you read as a conditional `updateMany` claim, then check `count === 0` and throw. The throw unwinds the whole transaction. Used everywhere money moves.

**Cargo is priced at Dar check-in and nowhere else.** `autoPriceShipments` runs when the warehouse checks boxes off the manifest, using the confirmed weight and piece count. `generateInvoice` refuses anything that has not landed.

**Billing rules:** minimum 1 kg chargeable weight; storage free 7 days from arrival, then USD 2/day. Rates live in `PricingRule`, never in code.

**Deleted cargo appears nowhere** but the delete history — including PDFs, labels and QR scans.

## Developer account

A separate `Role.DEVELOPER` row with its own email and password — never a flag on a staff account. Same pattern as ORA (`/Users/Nino/Desktop/Clients /3-Devs/ORA`). Nothing in the app can create, promote, suspend or reset one: `scripts/create-developer.mjs` (needs the database) is the only way, and `--recover` resets the password.

- **Sign-in** is ONE page for everybody; the account decides the session. A Developer row gets the guarded path: throttled (5 per address / 20 anywhere / 15 min), whole attempt under an advisory lock, 8-hour absolute session. Do not add a Staff/Developer toggle back.
- **The Developer's job is that the SYSTEM WORKS — never the business's operations.** "Needs your attention" lists only technical or integrity problems (servers, schema, settings, money-book promises, the nightly job). A ticket nobody answered, a flight not marked landed or a payment Finance has not verified is someone else's work: show it as data on the Cargo / Money / Messages tabs, never as an alert, and never write a hint that hands the Developer an operational task. Checks live in `lib/developer/diagnose.ts`; every one must be a rule the system promises, tested to return zero on healthy data.
- **Deleting an account deletes the ACCOUNT, never the data.** `deleteUser` (`lib/actions/users.ts`, Developer only) marks the row `INACTIVE`, replaces the password hash, and rewrites the email to `removed-<id>@removed.invalid` (the marker `NOT_REMOVED` filters lists on; the old email goes into the audit line). The row is KEPT so every payment, cargo record and audit line still names the person — a hard `user.delete` would blank that. Never the last owner, never self or a Developer; the name must be typed. New lists of people must use `NOT_REMOVED`.
- **The system watches itself, with no extra table.** Unexpected server errors are written by `instrumentation.ts` (`onRequestError` → `lib/developer/server-errors.ts`) as audit lines `system.error`, emails and long numbers blanked, ids in paths replaced by `:id`, rate-limited. The scheduled job writes `job.run` (`lib/developer/job-log.ts`). Both are kept out of "Everything" on Audit and out of the activity counts; Audit has a System pill. Every job in `vercel.json` must be listed in `JOBS` (`lib/developer/jobs.ts`) — `check:developer` fails otherwise. "System checks" (`diagnose.ts`) lists every rule with ok / needs fixing / look / could not be checked.
- **Developer console** (`/app/developer`, English only by design — one reader): Home (health ring, charts, tabs; data in `lib/developer/monitor.ts`), Audit, Access, Business (read-only tables). **Work as** is one press on the person's row; suspend / role / password still ask for a reason.
- **Permissions** are an explicit allow-list in `lib/rbac.ts` (`DEVELOPER`), deliberately NOT part of `ALL`. It holds no money-writing permission; `scripts/check-developer-account.mts` fails if one is added. Refused developer actions are audited as failures from `authorize()`.
- **Work as** (`lib/developer-workas.ts`) lets the Developer do everything the person they work as can do — the owner chose this knowingly (18 Oct 2026), money included. Every line is recorded under the DEVELOPER with `workingAs` in the metadata (`lib/audit.ts`); business rows ("received by", status history) still carry the borrowed person, so the audit trail is the truth about who. Stays refused while working as someone: everything behind `user.manage` (accounts, roles, passwords, suspend — `WORK_AS_NEVER` in `lib/session.ts`) and the person's own password change. Do not widen that list without asking.
- **Audit**: every developer line carries `metadata.developer = true`; `scripts/neon-developer-account.sql` adds a trigger that makes those rows append-only. Run that file on Neon BEFORE creating the account.

## Language

Every user-facing string goes through i18n: `t(locale, "English")` on the server, `useT()` in client components. English is the key; Chinese is the translation. Run `node scripts/check-i18n.mjs` — it must report zero missing. The China warehouse uses the app in Chinese, so test with `china@` to see what they see.

## Comments

Comments explain constraints the code cannot show — why a guard exists, what broke without it. Match the surrounding voice. Never write "fixed", "audit", or reference a task.

## Git

Commit and push straight to `main` automatically. No branches, no asking. **Never add Co-Authored-By or any AI attribution.**

## Verifying

There is a real dev server (`npx next dev -p 3188` — another project on this machine owns 3177, and hitting it signs you into a different company's app) and a local Postgres. Log in over the CSRF endpoint and drive the real forms with puppeteer-core rather than trusting that it compiles. Demo logins are `<role>@targetexpress.co.tz` with `SEED_ADMIN_PASSWORD` from `.env`.
