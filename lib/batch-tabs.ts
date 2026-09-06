import "server-only";

import type { Role } from "@prisma/client";

import { can } from "@/lib/rbac";
import type { BatchTab } from "@/components/app/batches-nav";

/**
 * The batch screens, for one viewer, in the order a flight lives.
 *
 * Loaded in Guangzhou, landed in Dar, signed off by Finance, and then read for
 * what it made. Built on the server from the same permissions the routes are
 * gated on, so the row can never offer a door that opens onto "no access".
 */
export function batchTabs(role: Role): BatchTab[] {
  return [
    {
      href: "/app/batches",
      label: "Loading batches",
      visible: can(role, "batch.view"),
    },
    {
      href: "/app/shipments",
      label: "Arrived batches",
      visible: can(role, "batch.view"),
    },
    {
      href: "/app/finance/income",
      label: "Closed batches",
      visible: can(role, "accounting.view"),
    },
    {
      href: "/app/finance/batches",
      label: "Batch finances",
      visible: can(role, "profit.view"),
    },
  ];
}
