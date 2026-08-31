import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { PrinterProbe } from "@/components/app/printer-probe";
import { t } from "@/lib/i18n";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Bluetooth printer test") };
}

/**
 * One question, asked from the floor that holds the printer.
 *
 * Guangzhou bought an XP-420B, paired it over Bluetooth, and pressing Print
 * still produced a PDF in the phone's Downloads folder — because a browser
 * cannot reach a printer directly and Android had no print service for it. Some
 * of these printers are Bluetooth Low Energy, which the browser CAN open; most
 * of the desktop ones are Bluetooth Classic, which it never can. Xprinter's own
 * manual does not say which the XP-420B is.
 *
 * A page rather than a message, because the only machine that can answer is the
 * phone standing next to the printer — and the app is installed to that phone's
 * home screen with no address bar to type a URL into, so the way in has to be a
 * link on the label page.
 *
 * Behind label.print: the desk that makes stickers is the desk with the printer.
 */
export default async function PrinterTestPage() {
  await requirePermission("label.print");
  const locale = await viewerLocale();

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader
        title={t(locale, "Bluetooth printer test")}
        description={t(
          locale,
          "Checks whether this printer is one the app can print to directly."
        )}
        backTo={{ href: "/app/cargo/new", label: t(locale, "Receive cargo") }}
      />
      <PrinterProbe />
    </div>
  );
}
