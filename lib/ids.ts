import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";

/**
 * Human-readable document numbers.
 *
 * Every number is minted from the Counter table inside the caller's
 * transaction, so two clerks pressing "Save" at the same moment can never
 * receive the same tracking number. `nextSequence` must therefore always be
 * given a transaction client, not the bare prisma singleton.
 */
async function nextSequence(
  tx: Prisma.TransactionClient,
  key: string
): Promise<number> {
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}

const pad = (n: number, width = 6) => String(n).padStart(width, "0");

export async function nextTrackingNumber(tx: Prisma.TransactionClient) {
  const n = await nextSequence(tx, "shipment");
  return `TX-${pad(n)}`;
}

export async function nextBatchNumber(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `batch:${year}`);
  return `BATCH-${year}-${pad(n, 3)}`;
}

/**
 * Batch numbers per route: HK-2026-001, GZ-2026-001.
 *
 * The route is in the number because these get read aloud over the phone and
 * written on cartons — "HK oh-oh-one" says which flight it is without anyone
 * looking it up. Numbering restarts each year, per route.
 */
export async function nextRouteBatchNumber(
  tx: Prisma.TransactionClient,
  route: "GUANGZHOU" | "HONG_KONG",
  year = new Date().getFullYear()
) {
  const prefix = route === "HONG_KONG" ? "HK" : "GZ";
  const n = await nextSequence(tx, `batch:${prefix}:${year}`);
  return `${prefix}-${year}-${pad(n, 3)}`;
}

export async function nextCustomerCode(tx: Prisma.TransactionClient) {
  const n = await nextSequence(tx, "customer");
  return `CUS-${pad(n)}`;
}

export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `invoice:${year}`);
  return `INV-${year}-${pad(n)}`;
}

export async function nextReceiptNumber(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `receipt:${year}`);
  return `RCT-${year}-${pad(n)}`;
}

export async function nextPickupNoteNumber(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `pickup:${year}`);
  return `PN-${year}-${pad(n)}`;
}

export async function nextTicketNumber(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `ticket:${year}`);
  return `TKT-${year}-${pad(n)}`;
}

export async function nextSourcingNumber(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `sourcing:${year}`);
  return `SRC-${year}-${pad(n)}`;
}

/**
 * The value physically encoded in the shipment's QR code.
 *
 * It is deliberately NOT the tracking number: tracking numbers are sequential
 * and public, so anyone could guess one and present a forged label at the
 * warehouse counter. 160 bits of entropy makes the QR itself the credential.
 */
export function generateQrToken() {
  return `TXQ${randomBytes(20).toString("base64url")}`;
}
