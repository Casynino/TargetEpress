import { PrismaClient } from "@prisma/client";

/**
 * The database client, with deleted cargo filtered out at the source.
 *
 * Soft delete is only worth having if it is impossible to forget. There are
 * more than twenty places that read shipments — batch pages, manifests,
 * dashboards, the support desk, public tracking, invoicing — and filtering in
 * each one is how a deleted record eventually reappears on a customer's
 * tracking page.
 *
 * So the filter lives here, once. Every read of `shipment` gains
 * `deletedAt: null` unless the caller says otherwise, and the only way to see
 * deleted cargo is to ask for it explicitly:
 *
 *   prisma.shipment.findMany({ where: { deletedAt: { not: null } } })
 *
 * Writes are untouched: deleting sets the timestamp, restoring clears it, and
 * both need to address a row the default filter would hide.
 */
function createClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  return base.$extends({
    name: "hide-deleted-cargo",
    query: {
      shipment: {
        async $allOperations({ operation, args, query }) {
          const READS = [
            "findFirst",
            "findFirstOrThrow",
            "findMany",
            "findUnique",
            "findUniqueOrThrow",
            "count",
            "aggregate",
            "groupBy",
          ];
          if (!READS.includes(operation)) return query(args);

          const where = (args as { where?: Record<string, unknown> }).where ?? {};
          // An explicit mention of deletedAt means the caller knows what they
          // are doing — the admin's deleted-records screen, or a restore.
          if ("deletedAt" in where) return query(args);

          return query({
            ...(args as object),
            where: { ...where, deletedAt: null },
          } as typeof args);
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof createClient>;

/**
 * The client handed to a `$transaction` callback.
 *
 * Derived from the extended client rather than `Prisma.TransactionClient`, so
 * helpers that run inside a transaction get the same deleted-cargo filter as
 * everything else. Using Prisma's own type here would quietly opt those helpers
 * out of it.
 */
export type TxClient = Omit<
  ExtendedClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
