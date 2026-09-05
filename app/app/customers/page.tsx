import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";

import { CustomersTable, type CustomerRow } from "@/components/app/customers-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { toNumber } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { phoneVariants } from "@/lib/support";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Customers" };

/**
 * The customer book.
 *
 * This page is the desk's answer to "do we have this person on file", and it
 * used to answer it wrongly. It loaded the 500 newest customers and nothing
 * else, and the table's search box filters only the rows it was handed — so the
 * 501st customer made every early account, which is to say every long-standing
 * one, report as non-existent rather than as not-loaded. A clerk then either
 * created a duplicate or told a customer they were not in the system.
 *
 * So the search is a server query now, in the URL, over every customer on file,
 * and the list carries a count and page links. Same shape as the expenses page,
 * deliberately: two list screens that page differently is two things to learn.
 *
 * Money is the other line: `outstanding` is left off the payload entirely for
 * anyone without finance.view, rather than being sent and hidden in the markup.
 */

/*
  Matches DataTable's own page size on purpose.

  The table pages its rows at 25 as well, so sending exactly one of its pages
  leaves one pager in play instead of two nested ones — and it is what bounds
  the nested `shipments` select below, which has no limit of its own.
*/
const PAGE_SIZE = 25;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requirePermission("customer.view");
  const locale = await viewerLocale();
  const showMoney = can(user.role, "finance.view");

  const params = await searchParams;
  const search = (params.q ?? "").trim();

  /*
    The four things somebody has when they are looking for an account: the
    business name, the customer code off an old invoice, the number the person
    is calling from, or the town.

    The phone goes in through `phoneVariants` — the same helper the cargo search
    uses — because numbers are stored as +255… and a customer reads theirs off
    the handset as 0757…. Matching only the stored shape fails on the single
    most common input.
  */
  const where: Prisma.CustomerWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
          /* Any number they use, not just the primary. */
          ...phoneVariants(search).flatMap((phone) => [
            { phone: { contains: phone } },
            { phones: { some: { phone: { contains: phone } } } },
          ]),
        ],
      }
    : {};

  /*
    Counted first so the page number can be clamped to a page that exists.
    Asking for ?page=99 of a three-page list otherwise renders an empty table
    under a header stating there are eight hundred customers, which reads as the
    list being broken rather than as the reader having overshot it.
  */
  const total = await prisma.customer.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pages);

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      city: true,
      createdAt: true,
      shipments: {
        where: { deletedAt: null },
        orderBy: { registeredAt: "desc" },
        select: {
          status: true,
          registeredAt: true,
          invoice: showMoney
            ? {
                select: {
                  status: true,
                  total: true,
                  amountPaid: true,
                  /* Without it outstandingOf reads every written-off
                     shilling as still owing — see BalanceInput. */
                  amountAdjusted: true,
                },
              }
            : false,
        },
      },
    },
  });

  const rows: CustomerRow[] = customers.map((customer) => {
    const active = customer.shipments.filter(
      (shipment) =>
        shipment.status !== "DELIVERED" && shipment.status !== "CANCELLED"
    ).length;

    /* Only bills that are actually owed. A draft is the system's own price
       before Finance has agreed it, and a written-off bill is one the company
       has decided it will never collect — counting either as debt puts a
       figure next to a customer's name that nobody intends to chase. */
    const outstanding = showMoney
      ? customer.shipments.reduce((sum, shipment) => {
          const invoice = shipment.invoice;
          if (!invoice) return sum;
          if (invoice.status !== "UNPAID" && invoice.status !== "PARTIALLY_PAID") {
            return sum;
          }
          return (
            sum + outstandingOf(invoice)
          );
        }, 0)
      : undefined;

    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.phone,
      city: customer.city,
      shipments: customer.shipments.length,
      activeShipments: active,
      outstanding,
      createdAt: customer.createdAt.toISOString(),
      lastShipmentAt: customer.shipments[0]?.registeredAt.toISOString() ?? null,
    };
  });

  /** Paging keeps the search, so turning a page never silently widens it. */
  const link = (next: { q?: string; page?: string }) => {
    const merged: Record<string, string | undefined> = {
      q: search || undefined,
      /* Any change of search starts again at page one — page 4 of a different
         list is a blank screen that looks like a bug. */
      page: undefined,
      ...next,
    };
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) qs.set(key, value);
    const s = qs.toString();
    return `/app/customers${s ? `?${s}` : ""}`;
  };

  const firstOnPage = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Created automatically the first time cargo is registered against a name or number."
      />

      {/*
        Searched in the database, suggested from the page.

        A GET form so the result is a linkable URL and the back button behaves,
        and pressing Search still goes to the server — over every customer on
        file, which is the whole reason this box exists rather than the table's
        own one below it.

        What is new is that it offers matches WHILE YOU TYPE: the name, the
        customer code and the phone of the customers on screen. A clerk with
        somebody on the line is recognising an account, not recalling whether it
        was saved as "Mama Grace K." — and a name typed one letter off comes
        back as "no customer matches that", which is how a duplicate account
        gets created.

        Those suggestions are THIS PAGE ONLY. The book runs to thousands and
        only twenty-five of them are in memory here, so the dropdown is a
        shortcut over what is already on screen and the server search behind the
        button remains the thing that answers "do we have this person on file".
        The caption says so, because a shortcut that is quiet about its edges is
        the same trap as the old 500-row table.
      */}
      <div className="mb-3 rounded-xl border bg-card p-3">
        <SearchBox
          defaultValue={search}
          placeholder={t(locale, "Name, customer ID, phone or city")}
          suggestions={customers.flatMap((customer) => [
            {
              value: customer.name,
              label: customer.name,
              /* The phone tells two "Mama Grace"s apart faster than anything
                 else on the row; the code stands in when there is no number. */
              hint: customer.phone ?? customer.code,
            },
            { value: customer.code, label: customer.name, hint: customer.code },
            ...(customer.phone
              ? [
                  {
                    value: customer.phone,
                    label: customer.name,
                    hint: customer.phone,
                  },
                ]
              : []),
          ])}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t(locale, "Searches every customer on file, however long ago they registered.")}{" "}
          {t(locale, "The suggestions are the customers on this page.")}
        </p>
      </div>

      {/* What the reader is looking at — never a list that silently stops, with
          the way back out beside the count that shows it is needed. */}
      <p className="mb-2 text-xs text-muted-foreground">
        {total === 0
          ? t(locale, "Nothing matches.")
          : `${t(locale, "Showing")} ${firstOnPage}–${lastOnPage} ${t(locale, "of")} ${total} ${t(locale, total === 1 ? "customer" : "customers")}`}
        {search ? ` · ${t(locale, "filtered")}` : ""}
        {search ? (
          <>
            {" · "}
            <Link
              href={link({ q: undefined })}
              className="underline-offset-2 hover:underline"
            >
              {t(locale, "Clear the search")}
            </Link>
          </>
        ) : null}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title={
            search
              ? t(locale, "No customer matches that")
              : t(locale, "No customers yet")
          }
          description={
            search
              ? t(
                  locale,
                  "Try a shorter piece of the name, the customer ID off an old invoice, or the last few digits of the phone number."
                )
              : t(
                  locale,
                  "They appear here as soon as the China desk registers cargo."
                )
          }
        />
      ) : (
        <CustomersTable rows={rows} />
      )}

      {/* Paging, only when there is more than one. */}
      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={link({ page: page === 2 ? undefined : String(page - 1) })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              ← {t(locale, "Newer")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            {t(locale, "Page")} {page} {t(locale, "of")} {pages}
          </span>
          {page < pages ? (
            <Link
              href={link({ page: String(page + 1) })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              {t(locale, "Older")} →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </>
  );
}
