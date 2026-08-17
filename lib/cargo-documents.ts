/**
 * Shared facts about a consignment's paperwork, importable from both the server
 * action and the page that renders it.
 *
 * Kept out of lib/actions/cargo-documents.ts because a "use server" module may
 * only export async functions — a constant exported from one fails at build, and
 * it fails in a way that names the wrong file.
 */

export const SHIPMENT_DOCUMENT_KINDS = [
  "SUPPLIER_INVOICE",
  "PACKING_LIST",
  "CUSTOMS",
  "DAMAGE",
  "OTHER",
] as const;

export type ShipmentDocumentKindValue =
  (typeof SHIPMENT_DOCUMENT_KINDS)[number];

/**
 * What each kind is called on screen.
 *
 * English here and translated where it is read, for the reason the whole app
 * follows: the same label is written into the audit trail, and a record stamped
 * in whichever language the person attaching it happened to be reading is a
 * record the other half of the company cannot search.
 */
export const SHIPMENT_DOCUMENT_KIND_LABELS: Record<
  ShipmentDocumentKindValue,
  string
> = {
  SUPPLIER_INVOICE: "Supplier invoice",
  PACKING_LIST: "Packing list",
  CUSTOMS: "Customs paperwork",
  DAMAGE: "Damage report",
  OTHER: "Other paperwork",
};

/**
 * The whole request body, not one file.
 *
 * A server action's body is capped at 4mb in next.config.mjs, which is itself
 * the platform's ceiling rather than a preference. So two 3 MB scans chosen
 * together never reach the action at all: the request dies before it arrives,
 * which surfaces as "something went wrong" with nothing saved and no error of
 * ours anywhere to explain it. The browser is the only place that can be said in
 * time, so the form adds up what has been chosen and says so before anybody
 * presses Attach.
 *
 * Deliberately under the 4mb cap. The kind, the note, the multipart boundaries
 * and the session cookie all travel in the same request as the files, so a
 * budget set exactly at the limit is a budget that fails at the limit.
 */
export const ATTACHMENT_BUDGET_BYTES = Math.round(3.5 * 1024 * 1024);

/** The size as a person reads it, from the one constant, so the two cannot drift. */
export function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
