import { PackageCheck, Plane, PlaneLanding, Warehouse } from "lucide-react";

import { COMPANY } from "@/lib/constants";

/**
 * A word to the customer, where three empty cells used to be.
 *
 * The fact grid runs nine items into a four-column row, so the last row stood
 * two thirds empty — a grey rectangle immediately above the amount somebody
 * owes, which is the worst place on the page to say nothing.
 *
 * It says something different at each stage, because a line that reads the same
 * whether the cargo is in Guangzhou or on the shelf in Kariakoo is decoration.
 * Swahili first: this is written for the person collecting the box.
 */
const NOTES: Record<
  string,
  { icon: typeof Plane; sw: string; en: string }
> = {
  READY_TO_DEPART: {
    icon: Warehouse,
    sw: "Mzigo wako umepokelewa China.",
    en: `Registered in Guangzhou and waiting for the next flight. ${COMPANY.promiseEn}`,
  },
  IN_TRANSIT: {
    icon: Plane,
    sw: "Mzigo wako uko angani.",
    en: "On the aircraft. We will message you the day it lands in Dar es Salaam.",
  },
  RECEIVED_AT_DAR: {
    icon: PlaneLanding,
    sw: "Umefika Dar es Salaam salama.",
    en: "Landed and checked in against the manifest, box by box.",
  },
  READY_FOR_PICKUP: {
    icon: PackageCheck,
    sw: "Uko tayari kuchukuliwa.",
    en: "Cleared for collection. Bring your tracking number to the counter in Kariakoo.",
  },
  DELIVERED: {
    icon: PackageCheck,
    sw: "Asante kwa kutuamini.",
    en: "Delivered and signed for. Thank you for shipping with Target Express.",
  },
};

export function CargoNote({ status }: { status: string }) {
  const note = NOTES[status];

  // No note rather than a bland one. A consignment under investigation has its
  // own panel on this page saying something true and specific, and a cheerful
  // line beside it would be the wrong thing to read twice.
  if (!note) return null;

  const Icon = note.icon;

  return (
    <div className="relative overflow-hidden bg-card p-5 sm:col-span-3 lg:col-span-3">
      {/* The corridor, faintly, behind the words. Pure CSS: this sits on a page
          customers open on a phone, on data they are paying for. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 20% 30%, currentColor 50%, transparent 50%)," +
            "radial-gradient(1px 1px at 70% 60%, currentColor 50%, transparent 50%)",
          backgroundSize: "90px 90px, 140px 140px",
        }}
      />

      <div className="relative flex items-start gap-3.5">
        <span className="drift-a inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-base font-semibold leading-snug">
            {note.sw}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {note.en}
          </p>
        </div>
      </div>
    </div>
  );
}
