import "server-only";

import QRCode from "qrcode";

/**
 * QR payloads.
 *
 * Two kinds of label exist. `TXAC:S:` identifies a shipment — the customer's
 * order, one per invoice. `TXAC:P:` identifies a single physical package, and
 * that is the one that goes on a box: five cartons carry five different codes.
 *
 * Both carry an opaque token rather than a tracking number, and both are
 * prefixed so a scanner can tell one of our labels from a random QR printed by
 * a Guangzhou supplier. Scanning resolves the token server-side — the code
 * itself grants nothing without a signed-in user.
 */
export function shipmentQrPayload(qrToken: string) {
  return `TXAC:S:${qrToken}`;
}

export function packageQrPayload(qrToken: string) {
  return `TXAC:P:${qrToken}`;
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

  // Tolerate a bare token, and full URLs from older labels. Neither says which
  // kind it is; the resolver falls back to looking in both tables.
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
