import { NextResponse } from "next/server";

import { normalisePhone } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { currentUser } from "@/lib/session";

/**
 * Auto-fill for the shipment form: type a phone number, get the customer back.
 * Staff-only — this is a customer directory, not a public endpoint.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !can(user.role, "customer.view")) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const phone = new URL(request.url).searchParams.get("phone");
  if (!phone || phone.length < 6) return NextResponse.json({ customer: null });

  const customer = await prisma.customer.findUnique({
    where: { phone: normalisePhone(phone) },
    select: { id: true, code: true, name: true, phone: true, city: true },
  });

  return NextResponse.json({ customer });
}
