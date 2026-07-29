# Target Express Air Cargo

Public tracking site + internal operations system for air freight from
Guangzhou / Hong Kong to Dar es Salaam.

One shipment is registered once in China and keeps the same identity —
tracking number and QR token — until it is released to the customer in Dar.

```
China warehouse  →  batch  →  flight  →  Dar check-in  →  payment  →  release
READY_TO_DEPART     IN_TRANSIT    RECEIVED_AT_DAR   READY_FOR_PICKUP   DELIVERED
```

## Stack

| Layer    | Choice                                        |
| -------- | --------------------------------------------- |
| Framework| Next.js 15 (App Router, Server Actions), React 19 |
| Language | TypeScript (strict)                           |
| Styling  | Tailwind CSS 3 + shadcn/ui primitives          |
| Database | Neon PostgreSQL                                |
| ORM      | Prisma 6                                       |
| Auth     | NextAuth v5 (credentials + bcrypt, JWT session)|
| Hosting  | Vercel                                         |

## Getting started

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm run db:push
npm run db:seed
npm run dev
```

`AUTH_SECRET` is generated with:

```bash
openssl rand -base64 32
```

The seed creates the CEO account from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
plus one account per department, and — only on an empty database — a set of
demo shipments spread across every stage so each dashboard has something to
show. **Change every seeded password after the first sign-in.**

## Deploying to Vercel + Neon

1. Create a Neon project and copy both connection strings.
   `DATABASE_URL` is the **pooled** one (`…-pooler.…`) used at runtime;
   `DIRECT_URL` is the **direct** one used by Prisma for schema changes.
2. Add every variable from `.env.example` to the Vercel project.
3. Push the schema **before** the first deploy — this project does not migrate
   automatically on deploy, so an unmigrated column breaks production:

   ```bash
   npm run db:push
   ```

4. Deploy. `postinstall` runs `prisma generate` on Vercel automatically.
5. Run `npm run db:seed` once against production to create the CEO account.

Cargo photo uploads use Vercel Blob. Add `BLOB_READ_WRITE_TOKEN` when you enable
a Blob store; without it the app runs fine and simply omits photo uploads.

## Roles

Four roles, each landing on its own dashboard after a single shared login.

| Role              | Can do                                                        |
| ----------------- | ------------------------------------------------------------- |
| `CHINA_WAREHOUSE` | Register cargo, print labels, build batches, record departure  |
| `DAR_WAREHOUSE`   | Receive batches, check cargo off the manifest, raise exceptions, release cargo |
| `FINANCE`         | Invoice, take payment, issue receipts and pickup notes         |
| `ADMIN` (CEO)     | Everything, plus staff management, reports and the audit log   |

Permissions are declared in [`lib/rbac.ts`](lib/rbac.ts) as fine-grained
capabilities (`shipment.create`, `pickupNote.issue`, …). Pages and server
actions always ask for a *permission*, never a role, so adding a fifth
department is a table edit rather than a refactor.

Access is checked three times over: in `middleware.ts`, again in the page via
`requirePermission()`, and once more inside every server action via
`authorize()`. The middleware alone is never the gate.

## The QR code

There is exactly one QR per shipment, attached in China and scanned again at
release.

- It encodes `TXAC:S:<qrToken>` — a 160-bit random token, **not** the tracking
  number. Tracking numbers are sequential and public, so a guessable code must
  never be able to authorise a release.
- `/app/scan` resolves the same code differently per role: China sees the
  registration, Finance sees the money, the Dar warehouse sees a plain
  release / do-not-release verdict.
- Releasing cargo requires the pickup note **and** a scan of the carton whose
  token matches it. A mismatch is refused server-side.

Every scanner has a manual code-entry fallback. Warehouse phones lose camera
permission and labels get scuffed; staff must always be able to finish the job.

## Money gates cargo

Cargo cannot be released until Finance has been paid:

1. Finance raises an invoice against the shipment (rate × weight, overridable).
2. Payment is recorded; a numbered receipt is issued in the same transaction.
3. Once the invoice is fully settled **and** the cargo is checked in at Dar,
   Finance can issue a pickup note. That is the only thing that moves a
   shipment to `READY_FOR_PICKUP`.
4. The warehouse releases against that note plus a matching cargo scan.

Overpayment is rejected rather than silently creating an unrepresented credit,
and an invoice can no longer be edited once any money has landed on it.

## What the public can see

`lib/tracking.ts` builds the public response by explicit allow-list. Staff
names, internal notes, prices, customer contact details and warehouse
instructions never reach it.

Searching a **batch** number returns batch-level flight status only — never the
list of shipments inside it, which would expose one customer's cargo to anyone
who knows the batch number.

## Printed documents

| Document      | Route                                | Who   |
| ------------- | ------------------------------------ | ----- |
| Cargo label   | `/app/shipments/[id]/label`          | China |
| Batch manifest| `/app/batches/[id]/manifest`         | Both warehouses |
| Pickup note   | `/app/finance/pickup-notes/[id]`     | Finance |

All three print through the browser with a shared print stylesheet — no PDF
service to keep alive. The manifest has a tick column, because it is checked
against physical cartons with a pen.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run db:push    # push schema to the database
npm run db:seed    # seed staff + demo cargo
npm run db:studio  # browse the data
```

## Notable design decisions

- **Decimal, never Float**, for money and weights. Air freight is billed on
  weight; floating-point drift is not acceptable in a ledger.
- **Document numbers come from a `Counter` table inside the caller's
  transaction**, so two clerks pressing Save at the same moment can never mint
  the same tracking number.
- **Status history and the audit log are append-only.** Nothing mutates them.
- **Weight cannot be edited after departure** — it is what was billed and flown.
- Shipments carry a `CANCELLED` status as an administrative exit. It is not part
  of the five-stage happy path.
