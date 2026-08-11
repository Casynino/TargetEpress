"use client";

import type { BatchStatus, ShipmentStatus } from "@prisma/client";

import { useT } from "@/components/app/locale-provider";
import { Badge } from "@/components/ui/badge";
import { BATCH_STATUS_META, SHIPMENT_STATUS_META } from "@/lib/constants";

/**
 * Runs in the browser purely so it can translate.
 *
 * These two badges are rendered from both server pages and client tables, and
 * a status is the one word a warehouse actually reads on a crowded row — so
 * translating here, once, is worth more than translating any single screen.
 * The props are a bare enum value, so nothing extra crosses the boundary.
 *
 * The English label in `*_STATUS_META` stays the dictionary key rather than
 * being replaced by one: an untranslated status still reads correctly.
 */

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const t = useT();
  const meta = SHIPMENT_STATUS_META[status];
  return <Badge variant={meta.tone}>{t(meta.label)}</Badge>;
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const t = useT();
  const meta = BATCH_STATUS_META[status];
  return <Badge variant={meta.tone}>{t(meta.label)}</Badge>;
}
