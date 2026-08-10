import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";

/**
 * Where a scanned label lands.
 *
 * Every QR printed by this system is a link to this route. It takes the token
 * off the sticker, works out which cargo it belongs to, and sends the visitor
 * to the public tracking page for it — so a customer holding a carton in
 * Kariakoo points a phone at the box and reads the whole journey, with no app
 * and no login.
 *
 * The token is looked up rather than decoded. It is random and unguessable, and
 * this is the only place that turns one into a tracking number: the same code
 * is what the Dar counter scans before releasing a box, and a code somebody
 * could derive from TX-000042 would be a way to claim the next customer's
 * cargo.
 *
 * Packages first. Five cartons under one shipment carry five different tokens,
 * and all five lead to the same tracking page — which is correct, because the
 * shipment is what the customer is tracking.
 */

export const metadata: Metadata = {
  title: "Opening your tracking page",
  // A label is not a page for a search engine to index; it is a doorway.
  robots: { index: false, follow: false },
};

export default async function ScannedLabelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const value = decodeURIComponent(token);

  const pkg = await prisma.package.findUnique({
    where: { qrToken: value },
    select: { shipment: { select: { trackingNumber: true } } },
  });
  if (pkg) redirect(`/track?q=${encodeURIComponent(pkg.shipment.trackingNumber)}`);

  const shipment = await prisma.shipment.findUnique({
    where: { qrToken: value },
    select: { trackingNumber: true },
  });
  if (shipment) redirect(`/track?q=${encodeURIComponent(shipment.trackingNumber)}`);

  // An unknown token is a label from another company, a damaged code, or a
  // shipment that has been deleted. None of those should look like an error in
  // the customer's own cargo.
  notFound();
}
