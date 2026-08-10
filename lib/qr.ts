import "server-only";

import QRCode from "qrcode";

import { siteUrl } from "@/lib/site-url";

/**
 * QR payloads.
 *
 * Every code is a URL, because the phone in a customer's hand is the commonest
 * scanner this business has. The old payload was `TXAC:P:<token>` — plain text
 * to a camera, which answers "No usable data found" and leaves the person
 * holding a box none the wiser. A URL opens the tracking page for that cargo
 * with no app and no account.
 *
 * It carries the token rather than the tracking number, and that is deliberate.
 * Tracking numbers run in sequence: TX-000042 tells you TX-000043 exists. This
 * same code is what the Dar counter scans to identify a box before releasing
 * it, so a guessable one is a way to walk in and claim someone else's cargo.
 * The token is random and unguessable; /t/<token> resolves it and sends the
 * visitor on to the public tracking page, which was always meant to be read by
 * anyone holding the number.
 *
 * The label prints the tracking number and "2 of 5" in large type beside the
 * code. Nobody reads a QR by eye — they read the label and scan the code.
 */
export function shipmentQrPayload(qrToken: string) {
  return `${siteUrl()}/t/${encodeURIComponent(qrToken)}`;
}

export function packageQrPayload(qrToken: string) {
  return `${siteUrl()}/t/${encodeURIComponent(qrToken)}`;
}

export type ScannedCode = {
  /** "package" when the label came off a box; "shipment" for order-level codes. */
  kind: "shipment" | "package";
  token: string;
};

export function parseQrPayload(raw: string): ScannedCode | null {
  const value = raw.trim();

  const pkg = value.match(/^TXAC:P:(.+)$/);
  if (pkg) return { kind: "package", token: pkg[1] };

  const shipment = value.match(/^TXAC:S:(.+)$/);
  if (shipment) return { kind: "shipment", token: shipment[1] };

  // The current label: a URL ending /t/<token>. "shipment" is a guess the
  // resolver corrects — it looks the token up in both tables, and a token is
  // unique across them.
  const link = value.match(/\/t\/([A-Za-z0-9_\-%]+)\/?$/);
  if (link) return { kind: "shipment", token: decodeURIComponent(link[1]) };

  // Tolerate a bare token, and older URL shapes. Labels already glued to boxes
  // in Guangzhou carry the old payloads and must keep working for as long as
  // those boxes are in the air.
  const urlMatch = value.match(/[?&]t=([^&]+)/);
  if (urlMatch) return { kind: "shipment", token: decodeURIComponent(urlMatch[1]) };
  if (/^TXQ[\w-]{20,}$/.test(value)) return { kind: "shipment", token: value };

  return null;
}

export async function qrDataUrl(payload: string, size = 240) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#0b1220ff", light: "#ffffffff" },
  });
}

export async function shipmentQrDataUrl(qrToken: string, size = 240) {
  return qrDataUrl(shipmentQrPayload(qrToken), size);
}

export async function packageQrDataUrl(qrToken: string, size = 240) {
  return qrDataUrl(packageQrPayload(qrToken), size);
}
