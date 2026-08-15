import type { Metadata } from "next";
import { MapPin, PackagePlus, Phone, Truck } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { RequestStatusPicker } from "@/components/app/request-status";
import { CATEGORY_LABELS } from "@/lib/cargo";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, formatRelative, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Requests" };

/**
 * What the website sent us.
 *
 * Bookings and pickups in one queue, because the desk works them the same way:
 * ring the person, agree what is happening, mark it done. They are separate
 * records — a pickup is a job for a driver, a booking is cargo that will
 * arrive — but nobody wants two inboxes.
 *
 * Nothing here can become a shipment by itself. Cargo is registered when the
 * boxes are on the counter and someone has weighed them, which is the whole
 * reason these are requests and not shipments.
 */
export default async function RequestsPage() {
  await requirePermission("shipment.create");
  const locale = await viewerLocale();

  const [bookings, pickups] = await Promise.all([
    prisma.bookingRequest.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 60,
      include: { handledBy: { select: { name: true } } },
    }),
    prisma.pickupRequest.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 60,
      include: { handledBy: { select: { name: true } } },
    }),
  ]);

  const openBookings = bookings.filter((b) => b.status === "PENDING").length;
  const openPickups = pickups.filter((p) => p.status === "PENDING").length;

  return (
    <>
      <PageHeader
        title={t(locale, "Requests from the website")}
        description={`${openBookings} ${t(locale, "booking(s) and")} ${openPickups} ${t(
          locale,
          "pickup(s) waiting for a call."
        )}`}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <PackagePlus className="h-4 w-4" />
              {t(locale, "Cargo bookings")}
            </h2>
            <span className="text-xs text-muted-foreground tabular">
              {bookings.length}
            </span>
          </div>

          {bookings.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t(locale, "Nothing yet. Bookings made on the website land here.")}
            </p>
          ) : (
            <ul className="divide-y">
              {bookings.map((booking) => (
                <li key={booking.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold tabular">
                        {booking.reference}
                      </p>
                      <p className="mt-0.5 font-medium">
                        {booking.customerName}
                        {booking.company ? ` · ${booking.company}` : ""}
                      </p>
                      <a
                        href={`tel:${booking.phone}`}
                        className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs text-brand tabular hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {booking.phone}
                      </a>
                    </div>
                    <RequestStatusPicker
                      kind="booking"
                      id={booking.id}
                      status={booking.status}
                    />
                  </div>

                  <p className="mt-3 text-sm">{booking.description}</p>

                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span>{t(locale, CATEGORY_LABELS[booking.cargoCategory])}</span>
                    <span>{t(locale, ORIGIN_LABELS[booking.origin])}</span>
                    {booking.estimatedWeightKg ? (
                      <span>
                        ~{toNumber(booking.estimatedWeightKg)} {t(locale, "kg")}
                      </span>
                    ) : null}
                    {booking.packages ? (
                      <span>
                        {booking.packages} {t(locale, "pieces")}
                      </span>
                    ) : null}
                    {booking.pickupNeeded ? (
                      <span className="font-medium text-warning">
                        {t(locale, "Needs collection")}
                      </span>
                    ) : null}
                    {booking.wantedBy ? (
                      <span>
                        {t(locale, "Wanted by")} {formatDate(booking.wantedBy, locale)}
                      </span>
                    ) : null}
                  </dl>

                  {booking.notes ? (
                    <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                      {booking.notes}
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatRelative(booking.createdAt, locale)}
                    {booking.handledBy ? ` · ${booking.handledBy.name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <Truck className="h-4 w-4" />
              {t(locale, "Pickup requests")}
            </h2>
            <span className="text-xs text-muted-foreground tabular">
              {pickups.length}
            </span>
          </div>

          {pickups.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t(locale, "Nothing yet. Collection requests land here for the driver.")}
            </p>
          ) : (
            <ul className="divide-y">
              {pickups.map((pickup) => (
                <li key={pickup.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold tabular">
                        {pickup.reference}
                      </p>
                      <p className="mt-0.5 font-medium">{pickup.customerName}</p>
                      <a
                        href={`tel:${pickup.phone}`}
                        className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs text-brand tabular hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {pickup.phone}
                      </a>
                    </div>
                    <RequestStatusPicker
                      kind="pickup"
                      id={pickup.id}
                      status={pickup.status}
                    />
                  </div>

                  <p className="mt-3 flex items-start gap-1.5 text-sm">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>
                      {pickup.address}, {pickup.city}
                      {pickup.mapsUrl ? (
                        <a
                          href={pickup.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-xs text-brand hover:underline"
                        >
                          {t(locale, "Open map")}
                        </a>
                      ) : null}
                    </span>
                  </p>

                  <p className="mt-2 text-sm text-muted-foreground">
                    {pickup.description}
                  </p>

                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    {pickup.estimatedWeightKg ? (
                      <span>
                        ~{toNumber(pickup.estimatedWeightKg)} {t(locale, "kg")}
                      </span>
                    ) : null}
                    {pickup.packages ? (
                      <span>
                        {pickup.packages} {t(locale, "pieces")}
                      </span>
                    ) : null}
                    {pickup.preferredAt ? (
                      <span>
                        {t(locale, "Prefers")} {formatDate(pickup.preferredAt, locale)}
                      </span>
                    ) : null}
                  </dl>

                  {pickup.notes ? (
                    <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                      {pickup.notes}
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatRelative(pickup.createdAt, locale)}
                    {pickup.handledBy ? ` · ${pickup.handledBy.name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
