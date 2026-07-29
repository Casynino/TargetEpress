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
