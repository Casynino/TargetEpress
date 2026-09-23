import type { Prisma } from "@prisma/client";

import { toNumber } from "@/lib/format";

/**
 * WHAT GUANGZHOU SAID, FOR THE FLOOR THAT IS ABOUT TO DISAGREE.
 *
 * Printed beside each field in the count dialog. Two sources, and the order
 * matters:
 *
 *   - the frozen column, once Dar has written its own figure over the live
 *     one. That is China's, kept at the moment it was replaced;
 *   - the live column, before any of that has happened — which is still
 *     China's, because nobody else has touched it.
 *
 * The trap is the third case, and it is the reason this is a function rather
 * than four `??` in a page. Guangzhou does not always give a piece count or a
 * volume: nothing is frozen because there was nothing to freeze. Falling
 * through to the live column then reads DAR'S OWN count back as "China said
 * 40" — the floor's own figure quoted at it as the packing list's, on the one
 * screen whose entire job is to compare the two.
 *
 * So once the cargo has been counted in Dar — which `declaredPackages` marks,
 * since it is written on every check-in — a missing declared figure means
 * China never gave one, and nothing is said.
 */
export type ChinaFigures = {
  packages: number;
  pieces: number | null;
  weightKg: number;
  volumeCbm: number | null;
};

type Measured = {
  packages: number;
  pieces: number | null;
  weightKg: Prisma.Decimal | number;
  volumeCbm: Prisma.Decimal | number | null;
  declaredPackages: number | null;
  declaredPieces: number | null;
  declaredWeightKg: Prisma.Decimal | number | null;
  declaredVolumeCbm: Prisma.Decimal | number | null;
};

export function chinaFiguresOf(shipment: Measured): ChinaFigures {
  const counted = shipment.declaredPackages !== null;
  const pieces = shipment.declaredPieces ?? (counted ? null : shipment.pieces);
  const volume =
    shipment.declaredVolumeCbm ?? (counted ? null : shipment.volumeCbm);

  return {
    packages: shipment.declaredPackages ?? shipment.packages,
    pieces,
    weightKg: toNumber(shipment.declaredWeightKg ?? shipment.weightKg),
    volumeCbm: volume === null ? null : toNumber(volume),
  };
}
