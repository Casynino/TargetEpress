import { redirect } from "next/navigation";

/**
 * There is no standalone invoice list.
 *
 * An invoice is not a thing in its own right — it is what one consignment
 * costs. Read on its own, a page of eighty-six invoice numbers tells you
 * nothing about which cargo they belong to or where that cargo is, so the
 * owner asked for it to go: every invoice is reached from the cargo it bills,
 * or from the dispatch that cargo flew on.
 *
 * The route survives as a redirect rather than a 404 because saved links,
 * WhatsApp messages and revalidatePath calls all still point at it.
 *
 * The document itself lives at /app/finance/invoices/[id] and is untouched.
 */
export default function InvoicesIndexPage() {
  redirect("/app/finance");
}
