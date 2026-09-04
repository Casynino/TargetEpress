import { randomBytes } from "crypto";
import type { Origin, Prisma } from "@prisma/client";
import { batchNumberFor, batchPrefix } from "@/lib/cargo";
import type { TxClient } from "@/lib/prisma";

/**
 * Human-readable document numbers.
 *
 * Every number is minted from the Counter table inside the caller's
 * transaction, so two clerks pressing "Save" at the same moment can never
 * receive the same tracking number. `nextSequence` must therefore always be
 * given a transaction client, not the bare prisma singleton.
 */
async function nextSequence(
  tx: TxClient,
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

export async function nextTrackingNumber(tx: TxClient) {
  const n = await nextSequence(tx, "shipment");
  return `TX-${pad(n)}`;
}

/**
 * The number of one batch: GZ-0028, HK-0013.
 *
 * Where it loaded, then its place in that location's own run. It is minted
 * here and never typed, which is what stops a batch from being called
 * BATCH-2026-004 one week, GZ-SHIP-2026-001 the next and IMPORTED the week
 * after that.
 *
 * The two locations count separately, so Hong Kong's run is unaffected by how
 * busy Guangzhou has been and the other way round. Nothing renumbers when a
 * batch is cancelled: a gap in the run is the honest record of one.
 *
 * Because the prefix IS the location, `originFromBatchNumber` can read it
 * back, and every path that creates or imports a batch checks the two agree
 * rather than trusting whoever typed them. That check is the whole reason the
 * number has a shape.
 */
export async function nextBatchNumber(tx: TxClient, route: Origin) {
  const n = await nextSequence(tx, `batch:${batchPrefix(route)}`);
  return batchNumberFor(route, n);
}

/** Requests that came in off the website, before any cargo exists. */
export async function nextBookingReference(tx: TxClient) {
  const n = await nextSequence(tx, "booking");
  return `BK-${pad(n)}`;
}

export async function nextPickupReference(tx: TxClient) {
  const n = await nextSequence(tx, "pickup");
  return `PU-${pad(n)}`;
}

export async function nextCustomerCode(tx: TxClient) {
  const n = await nextSequence(tx, "customer");
  return `CUS-${pad(n)}`;
}

export async function nextInvoiceNumber(
  tx: TxClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `invoice:${year}`);
  return `INV-${year}-${pad(n)}`;
}

/**
 * A block of invoice numbers, taken in one go.
 *
 * Check-in raises a draft for every consignment on a manifest, and asking the
 * counter for one number at a time meant a round trip per line — eighty-seven
 * boxes, eighty-seven waits. One increment of N hands back the whole run, and
 * it is exactly as safe as N separate ones: the upsert is atomic, so two desks
 * checking in different flights at the same moment get disjoint blocks.
 *
 * Returned in order, oldest number first.
 */
export async function reserveInvoiceNumbers(
  tx: TxClient,
  count: number,
  year = new Date().getFullYear()
): Promise<string[]> {
  if (count <= 0) return [];
  const counter = await tx.counter.upsert({
    where: { key: `invoice:${year}` },
    create: { key: `invoice:${year}`, value: count },
    update: { value: { increment: count } },
  });
  const last = counter.value;
  return Array.from(
    { length: count },
    (_, i) => `INV-${year}-${pad(last - count + 1 + i)}`
  );
}

export async function nextReceiptNumber(
  tx: TxClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `receipt:${year}`);
  return `RCT-${year}-${pad(n)}`;
}

export async function nextSubmissionNumber(
  tx: TxClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `submission:${year}`);
  return `SUB-${year}-${pad(n)}`;
}

export async function nextPickupNoteNumber(
  tx: TxClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `pickup:${year}`);
  return `PN-${year}-${pad(n)}`;
}

/** The number on a move between our own accounts: TRF-2026-000123. */
export async function nextTransferNumber(
  tx: TxClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `transfer:${year}`);
  return `TRF-${year}-${pad(n)}`;
}

/** The number on a cost the business paid: EXP-2026-000123. */
export async function nextExpenseNumber(
  tx: TxClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `expense:${year}`);
  return `EXP-${year}-${pad(n)}`;
}

/**
 * The number on a line in the general ledger: GL-2026-000123.
 *
 * Minted inside the caller's transaction like every other document number
 * here, for the same reason — two payments recorded in the same second must
 * not be able to claim the same ledger line.
 */
export async function nextLedgerNumber(
  tx: TxClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `ledger:${year}`);
  return `GL-${year}-${pad(n)}`;
}

export async function nextTicketNumber(
  tx: TxClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `ticket:${year}`);
  return `TKT-${year}-${pad(n)}`;
}

export async function nextSourcingNumber(
  tx: TxClient,
  year = new Date().getFullYear()
) {
  const n = await nextSequence(tx, `sourcing:${year}`);
  return `SRC-${year}-${pad(n)}`;
}

/**
 * The reference printed on a package sticker: TX-000125-P1.
 *
 * Readable and orderable, so a clerk holding two boxes can tell which is which
 * without a scanner. It is NOT what the QR encodes — see generateQrToken.
 */
export function packageReference(trackingNumber: string, sequence: number) {
  return `${trackingNumber}-P${sequence}`;
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
