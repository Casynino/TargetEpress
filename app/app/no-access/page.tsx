import Link from "next/link";
import { ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { requireUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

/**
 * The one screen a person reaches by being refused.
 *
 * It was written in English throughout, and the desk that meets it most is
 * Guangzhou — who read the whole app in Chinese and, at the moment of being
 * turned away, were handed a sentence they could not read.
 */
export default async function NoAccessPage() {
  const user = await requireUser();
  const locale = await viewerLocale();

  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldX className="h-7 w-7" />
      </span>
      <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
        {t(locale, "That area is not yours")}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {t(locale, "You are signed in as")}{" "}
        <span className="font-medium">{user.name}</span> (
        {t(locale, ROLE_LABELS[user.role])}).{" "}
        {t(
          locale,
          "This page belongs to another department. If you need access, ask the CEO to change your role."
        )}
      </p>
      <Button asChild variant="brand" className="mt-6 rounded-xl">
        <Link href="/app/dashboard">{t(locale, "Back to my dashboard")}</Link>
      </Button>
    </div>
  );
}
