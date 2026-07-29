import type { BatchStatus, ShipmentStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { BATCH_STATUS_META, SHIPMENT_STATUS_META } from "@/lib/constants";

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const meta = SHIPMENT_STATUS_META[status];
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const meta = BATCH_STATUS_META[status];
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}
