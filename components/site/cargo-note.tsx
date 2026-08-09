import {
  PackageCheck,
  Plane,
  PlaneLanding,
  SearchCheck,
  Scale,
  Warehouse,
} from "lucide-react";

import type { PublicInvestigation, PublicTimelineEntry } from "@/lib/tracking";
import { STORAGE_POLICY } from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";

/**
 * A word to the customer, where three empty cells used to be.
 *
 * The fact grid runs nine items into a four-column row, so the last row stood
 * two thirds empty — a grey rectangle immediately above the amount somebody
 * owes, which is the worst place on the page to say nothing. On a held shipment
 * it said nothing at all: the note returned null for an investigation, so the
 * one customer most in need of an explanation got a black panel.
 *
 * Every line here is assembled from that shipment's own facts — the date it was
 * received, the date it flew, how many boxes were counted in, how long a case
 * has been open. Two customers never read the same sentence, and the same
 * customer reads a different one next week, because the sentence is made of
 * things that changed. A fixed paragraph per status is the thing this replaces:
 * it is the same words for everybody, so it stops being read.
 *
 * Swahili first: this is written for the person collecting the box.
 */

type Icon = typeof Plane;

function stampFor(
  timeline: PublicTimelineEntry[],
  status: string
): string | null {
  return timeline.find((step) => step.status === status)?.at ?? null;
}

export function CargoNote({
  status,
  origin,
  timeline,
  expectedArrival,
  registeredAt,
  packagesLabel,
  arrivedCount,
  outstanding,
  hold,
}: {
  status: string;
  /** "Guangzhou, China" — in the words the rest of the page uses. */
  origin: string;
  timeline: PublicTimelineEntry[];
  expectedArrival: string | null;
  registeredAt: string | null;
  packagesLabel: string;
  /** How many of the customer's boxes have been checked in at Dar, if known. */
  arrivedCount: number | null;
  /** What is still owed, when there is an invoice. */
  outstanding: number | null;
  hold: PublicInvestigation | null;
}) {
  const departed = stampFor(timeline, "IN_TRANSIT");
  const arrived = stampFor(timeline, "RECEIVED_AT_DAR");
  const ready = stampFor(timeline, "READY_FOR_PICKUP");
  const delivered = stampFor(timeline, "DELIVERED");

  let icon: Icon = Warehouse;
  let sw: string;
  let en: string;

  if (hold) {
    // The hold speaks over the status, and where the cargo stopped decides what
    // there is to say. "We are checking a problem" is true of all three and
    // useful in none of them.
    icon = hold.state === "COMPENSATION_IN_PROGRESS" ? Scale : SearchCheck;

    if (hold.state === "COMPENSATION_IN_PROGRESS") {
      sw = "Tunashughulikia madai yako.";
      en =
        `We have agreed how to put this right, and your claim has been with our team since ${formatDate(hold.since)}` +
        ` — ${formatRelative(hold.since)}. We will contact you with the outcome; there is nothing you need to do.`;
    } else if (arrived) {
      sw = "Umefika, tunaukagua.";
      en =
        `It landed on ${formatDate(arrived)} and is here in Dar es Salaam. ` +
        `We opened a check on it ${formatRelative(hold.since)} and it stays with us until that is settled.`;
    } else if (departed) {
      sw = "Bado haujafika Dar es Salaam.";
      en =
        `It left ${origin} on ${formatDate(departed)} and has not been checked in at our Dar es Salaam warehouse. ` +
        `We have been tracing it since ${formatDate(hold.since)} and will call you the moment we know more.`;
    } else {
      sw = "Bado uko China, tunaukagua.";
      en =
        `It has not left ${origin}. We opened a check on it ${formatRelative(hold.since)}, ` +
        `and nothing goes on a flight until that is settled.`;
    }
  } else if (status === "DELIVERED") {
    icon = PackageCheck;
    sw = "Asante kwa kutuamini.";
    en = `Collected on ${formatDate(delivered)} — ${packagesLabel}, handed over and signed for. Karibu tena.`;
  } else if (status === "READY_FOR_PICKUP") {
    icon = PackageCheck;
    sw = "Uko tayari kuchukuliwa.";
    en =
      `Cleared for collection ${ready ? formatRelative(ready) : "today"}. ` +
      `Bring this tracking number to our counter in Kariakoo — storage is free for ` +
      `${STORAGE_POLICY.freeDays} days from the day it landed.`;
  } else if (status === "RECEIVED_AT_DAR") {
    icon = PlaneLanding;
    sw = "Umefika Dar es Salaam salama.";
    en =
      `Landed on ${formatDate(arrived)} and checked in against the manifest` +
      (arrivedCount !== null ? `, ${arrivedCount} of ${packagesLabel} counted` : "") +
      (outstanding !== null && outstanding > 0
        ? ". Settle the balance and we will release it the same day."
        : ". Your invoice follows once the count is confirmed.");
  } else if (status === "IN_TRANSIT") {
    icon = Plane;
    sw = "Mzigo wako uko angani.";
    en =
      `Left ${origin} on ${formatDate(departed)}` +
      (expectedArrival
        ? `, due in Dar es Salaam around ${formatDate(expectedArrival)}.`
        : ".") +
      " We will message you the day it lands.";
  } else if (status === "READY_TO_DEPART") {
    icon = Warehouse;
    sw = `Mzigo wako uko salama ${origin}.`;
    en =
      `Received and labelled ${registeredAt ? formatRelative(registeredAt) : "recently"}` +
      (expectedArrival
        ? `, booked to reach Dar es Salaam around ${formatDate(expectedArrival)}.`
        : ", waiting for the next flight out.") +
      ` Nothing to collect yet.`;
  } else {
    // CANCELLED, and anything a future status adds. No cheerful line for a
    // state we have not written words for — silence beats a wrong sentence.
    return null;
  }

  const Icon = icon;

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
        <span
          className={
            hold
              ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning"
              : "drift-a inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"
          }
        >
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-base font-semibold leading-snug">
            {sw}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {en}
          </p>
        </div>
      </div>
    </div>
  );
}
