"use client";

import type { ExceptionType } from "@prisma/client";
import { PackageCheck, PackageX } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { cargoIsHere, presenceLabel } from "@/lib/cargo-presence";

/**
 * IS THE BOX IN THE BUILDING, OR IS SOMEBODY LOOKING FOR IT?
 *
 * Every open case read "Under investigation" — a torn carton sitting on a
 * shelf in Kariakoo and a consignment nobody can find, in the same words. The
 * owner asked for the two to stop looking alike, and he is right that they are
 * different jobs: one is "come and collect it, it is dented", the other is "we
 * are searching".
 *
 * The fault name says WHAT is wrong and this says WHERE the cargo is. Both are
 * needed — "Damaged" alone does not say the box is on the floor, and "Cargo
 * present" alone does not say why it is flagged.
 *
 * Green for present, amber for absent. Not red: absent cargo is already the
 * loudest thing on any list it appears in, and a second red beside the fault
 * name would say the box is lost when most of the time it is late.
 *
 * A client component so the desk table and the cargo card can both use it —
 * one of them is client-side and the other is not, and two copies of this
 * would be two chances to disagree about where a box is.
 */
export function PresenceBadge({
  type,
  className,
}: {
  type: ExceptionType;
  className?: string;
}) {
  const t = useT();
  const here = cargoIsHere(type);
  const Icon = here ? PackageCheck : PackageX;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
        here
          ? "border-success/40 bg-success/10 text-success"
          : "border-warning/40 bg-warning/10 text-warning"
      } ${className ?? ""}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {t(presenceLabel(type))}
    </span>
  );
}
