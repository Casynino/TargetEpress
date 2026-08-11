import Link from "next/link";

import { BrandLockup } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

export default async function NotFound() {
  const locale = await viewerLocale();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <BrandLockup />
      <p className="mt-10 font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
        {t(locale, "We could not find that page")}
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        {t(locale, "The link may be old, or the shipment may have been removed.")}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild variant="brand" className="rounded-xl">
          <Link href="/">{t(locale, "Go to the homepage")}</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/track">{t(locale, "Track a shipment")}</Link>
        </Button>
      </div>
    </div>
  );
}
