import "server-only";

import QRCode from "qrcode";

/**
 * QR payload.
 *
 * The code carries the shipment's opaque token, not its tracking number, and
 * is prefixed so a scanner can tell one of our labels from a random QR on a
 * carton. Scanning resolves the token server-side — the code itself grants
 * nothing without a signed-in user.
 */
export function shipmentQrPayload(qrToken: string) {
  return `TXAC:S:${qrToken}`;
}

export function parseQrPayload(raw: string): string | null {
  const value = raw.trim();
  const match = value.match(/^TXAC:S:(.+)$/);
  if (match) return match[1];
  // Tolerate a bare token, and full URLs from older labels.
  const urlMatch = value.match(/[?&]t=([^&]+)/);
  if (urlMatch) return decodeURIComponent(urlMatch[1]);
  if (/^TXQ[\w-]{20,}$/.test(value)) return value;
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
