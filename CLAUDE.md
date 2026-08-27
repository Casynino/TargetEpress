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

## Language

Every user-facing string goes through i18n: `t(locale, "English")` on the server, `useT()` in client components. English is the key; Chinese is the translation. Run `node scripts/check-i18n.mjs` — it must report zero missing. The China warehouse uses the app in Chinese, so test with `china@` to see what they see.

## Comments

Comments explain constraints the code cannot show — why a guard exists, what broke without it. Match the surrounding voice. Never write "fixed", "audit", or reference a task.

## Git

Commit and push straight to `main` automatically. No branches, no asking. **Never add Co-Authored-By or any AI attribution.**

## Verifying

There is a real dev server (`npx next dev -p 3177`) and a local Postgres. Log in over the CSRF endpoint and drive the real forms with puppeteer-core rather than trusting that it compiles. Demo logins are `<role>@targetexpress.co.tz` with `SEED_ADMIN_PASSWORD` from `.env`.
