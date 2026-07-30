import type { Role } from "@prisma/client";

/**
 * Permission model.
 *
 * Roles are coarse (four departments); permissions are fine. Every server
 * action and every page guard asks for a *permission*, never a role — so
 * adding a fifth department later is a table edit, not a refactor.
 */
export type Permission =
  // Shipments
  | "shipment.view"
  | "shipment.create"
  | "shipment.edit"
  | "shipment.depart"
  | "shipment.cancel"
  | "shipment.viewInternal" // internal notes, cost inputs, staff names
  | "shipment.scan" // holds physical cargo and reads its label
  // Batches
  | "batch.view"
  | "batch.create"
  | "batch.manage" // add/remove shipments, seal, record flight
  | "batch.receive" // mark arrived in Dar
  | "batch.verify" // tick shipments off the manifest
  // Exceptions
  | "exception.raise"
  | "exception.resolve"
  // Finance
  | "finance.view"
  | "invoice.manage"
  | "payment.record"
  | "pickupNote.issue"
  | "pickupNote.cancel"
  // Delivery
  | "shipment.release"
  // Customers
  | "customer.view"
  | "customer.manage"
  // Administration
  | "user.manage"
  | "audit.view"
  | "report.view";

const CHINA: Permission[] = [
  "shipment.view",
  "shipment.create",
  "shipment.edit",
  "shipment.depart",
  "shipment.viewInternal",
  "batch.view",
  "batch.create",
  "batch.manage",
  "customer.view",
  "customer.manage",
];

const DAR: Permission[] = [
  "shipment.view",
  "shipment.viewInternal",
  "shipment.scan",
  "batch.view",
  "batch.receive",
  "batch.verify",
  "exception.raise",
  "exception.resolve",
  "shipment.release",
  "customer.view",
];

/**
 * Customer Care answers "where is my cargo and what do I owe".
 *
 * It sees the money because that is the question customers ask, and it may
 * raise an invoice — but it cannot confirm a payment or release cargo. Taking
 * money and acknowledging money stay with Finance.
 */
const CUSTOMER_CARE: Permission[] = [
  "shipment.view",
  "batch.view",
  "finance.view",
  "invoice.manage",
  "customer.view",
  "customer.manage",
  "exception.raise",
];

const FINANCE: Permission[] = [
  "shipment.view",
  "shipment.viewInternal",
  // Finance sits in the Dar office; a customer arriving with a label in hand is
  // a real scan case, and the scan shows them what is owed.
  "shipment.scan",
  "batch.view",
  "finance.view",
  "invoice.manage",
  "payment.record",
  "pickupNote.issue",
  "pickupNote.cancel",
  "customer.view",
  "customer.manage",
  "exception.raise",
  "report.view",
];

/** The CEO sees and can do everything — but is never required to. */
const ALL: Permission[] = Array.from(
  new Set<Permission>([
    ...CHINA,
    ...DAR,
    ...FINANCE,
    ...CUSTOMER_CARE,
    "shipment.cancel",
    "user.manage",
    "audit.view",
    "report.view",
  ])
);

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  CHINA_WAREHOUSE: CHINA,
  DAR_WAREHOUSE: DAR,
  FINANCE,
  CUSTOMER_CARE,
};

export function can(role: Role | undefined | null, permission: Permission) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAny(role: Role | undefined | null, permissions: Permission[]) {
  return permissions.some((p) => can(role, p));
}

/**
 * Route guard table, evaluated longest-prefix-first in middleware and again in
 * the layout. Anything under /app not listed here needs only a valid session.
 */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/app/scan", permission: "shipment.scan" },
  { prefix: "/app/shipments/new", permission: "shipment.create" },
  { prefix: "/app/batches/new", permission: "batch.create" },
  { prefix: "/app/receive", permission: "batch.receive" },
  { prefix: "/app/release", permission: "shipment.release" },
  { prefix: "/app/exceptions", permission: "exception.raise" },
  { prefix: "/app/finance", permission: "finance.view" },
  { prefix: "/app/admin/users", permission: "user.manage" },
  { prefix: "/app/admin/audit", permission: "audit.view" },
  { prefix: "/app/admin", permission: "report.view" },
  { prefix: "/app/customers", permission: "customer.view" },
  { prefix: "/app/batches", permission: "batch.view" },
  { prefix: "/app/shipments", permission: "shipment.view" },
];

export function permissionForPath(pathname: string): Permission | null {
  const match = ROUTE_PERMISSIONS.filter((r) =>
    pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.permission ?? null;
}

/**
 * Where every role lands after login. The dashboard itself renders the right
 * department view, so there is a single post-login destination.
 */
export const POST_LOGIN_PATH = "/app/dashboard";
