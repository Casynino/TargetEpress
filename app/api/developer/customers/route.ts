import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { currentUser } from "@/lib/session";
import { phoneVariants } from "@/lib/support";

/**
 * Customer lookup for the Developer's Access page.
 *
 * Customers are not listed there — there are too many, and a name or a number
 * is how anyone finds one. Matches name, customer code or any number they use,
 * in either way a Tanzanian number gets written. Customers already removed do
 * not come back.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !can(user.role, "developer.access")) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2) return NextResponse.json({ customers: [] });

  const where = {
    removedAt: null,
    OR: [
      { name: { contains: query, mode: "insensitive" as const } },
      { code: { contains: query, mode: "insensitive" as const } },
      ...phoneVariants(query).flatMap((phone) => [
        { phone: { contains: phone } },
        { phones: { some: { phone: { contains: phone } } } },
      ]),
    ],
  };
  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      take: 30,
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        city: true,
        suspendedAt: true,
        _count: {
          select: {
            shipments: { where: { deletedAt: null } },
            invoices: true,
            payments: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    total,
    customers: customers.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      phone: c.phone,
      city: c.city,
      suspended: c.suspendedAt !== null,
      cargo: c._count.shipments,
      bills: c._count.invoices,
      payments: c._count.payments,
    })),
  });
}
