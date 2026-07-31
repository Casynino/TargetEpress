import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { currentUser } from "@/lib/session";
import { phoneVariants } from "@/lib/support";

/**
 * Customer search for the registration form.
 *
 * Staff-only — this is the customer directory, not a public endpoint. Matches
 * on name, code, or phone in either of the ways a Tanzanian number gets
 * written: the desk types what the customer says (0762…) while the book holds
 * +255762….
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !can(user.role, "customer.view")) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2) return NextResponse.json({ customers: [] });

  const customers = await prisma.customer.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { code: { contains: query, mode: "insensitive" } },
        ...phoneVariants(query).map((phone) => ({
          phone: { contains: phone },
        })),
      ],
    },
    orderBy: { name: "asc" },
    take: 8,
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      city: true,
      _count: { select: { shipments: true } },
    },
  });

  return NextResponse.json({
    customers: customers.map((customer) => ({
      id: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.phone,
      city: customer.city,
      shipments: customer._count.shipments,
    })),
  });
}
