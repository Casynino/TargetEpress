/**
 * The label printer's own language.
 *
 * Xprinter's desktop label machines speak TSPL — the TSC command set — not
 * ESC/POS, which is the receipt-printer language people reach for first. A
 * receipt command sent to one of these produces either nothing or a metre of
 * blank roll, so the distinction is the difference between a working printer
 * and a wasted afternoon.
 *
 * Coordinates are in DOTS, and the head is 203 dpi: 8 dots to the millimetre.
 * `SIZE` and `GAP` are the only two given in millimetres, because they describe
 * the stock rather than the artwork.
 *
 * Latin-1 on the wire, deliberately. TSPL takes bytes, and the internal fonts
 * are single-byte — a Chinese character sent as UTF-8 arrives as three pieces
 * of nonsense. Anything that must carry Chinese has to be drawn as an image
 * instead, which is why this file prints a TEST label and not a real one.
 */

/** 203 dpi. Every coordinate below is dots; this converts from the real world. */
export const DOTS_PER_MM = 8;

export function mm(value: number): number {
  return Math.round(value * DOTS_PER_MM);
}

/**
 * A label with nothing on it but proof that the printer heard us.
 *
 * Deliberately small and deliberately ASCII: this exists to answer one
 * question — do these bytes reach the head and come out as paper — and every
 * extra element is another thing that could be what failed. If this prints,
 * the transport works and the language is right, and a real label is then a
 * matter of drawing rather than plumbing.
 */
export function testLabel(code: string): string {
  return [
    /* The stock, not the artwork. GAP 2mm is the standard die-cut spacing on
       4x6 rolls; a continuous roll would want GAP 0. */
    "SIZE 100 mm, 150 mm",
    "GAP 2 mm, 0",
    "DIRECTION 1",
    "CLS",
    'TEXT 40,40,"4",0,1,1,"TARGET EXPRESS"',
    'TEXT 40,110,"3",0,1,1,"PRINTER TEST"',
    `TEXT 40,170,"3",0,1,1,"${code}"`,
    `QRCODE 40,230,L,8,A,0,"${code}"`,
    'TEXT 40,560,"2",0,1,1,"If you can read this, direct printing works."',
    "PRINT 1,1",
    "",
  ].join("\r\n");
}

/**
 * TSPL text as bytes.
 *
 * Latin-1 rather than TextEncoder's UTF-8: see the note at the top. Anything
 * above 0xff is replaced rather than silently truncated to a different letter.
 */
export function toPrinterBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[i] = code < 256 ? code : 0x3f; // '?'
  }
  return out;
}
