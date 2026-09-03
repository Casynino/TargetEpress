"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { useT } from "@/components/app/locale-provider";
import { useSmartBack } from "@/components/app/smart-back";
import { Button } from "@/components/ui/button";

/**
 * A "‹ Back" pill that goes where the reader actually came from.
 *
 * The button-styled back links scattered across detail pages — "‹ All staff",
 * "‹ Back to cargo", a print screen's "‹ Batch" — were each a raw `<Link>` to
 * one hardcoded route, so every one of them sent a reader back to a record's
 * relationship rather than the list they were working from. This is the same
 * resolution the page-header `SmartBack` does, kept in the exact `Button
 * asChild` shape each of these already used, so converting a page changes
 * where it points without changing how it looks.
 */
export function BackLinkButton({
  fallbackHref,
  fallbackLabel,
  icon,
  variant = "ghost",
  size = "sm",
  className,
}: {
  fallbackHref: string;
  fallbackLabel: string;
  icon?: ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const t = useT();
  const target = useSmartBack(fallbackHref, fallbackLabel);

  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link href={target.href}>
        {icon ?? <ArrowLeft className="mr-2 h-4 w-4" />}
        {t(target.label)}
      </Link>
    </Button>
  );
}
