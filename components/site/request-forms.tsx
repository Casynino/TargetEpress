"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, Send } from "lucide-react";

import { submitBooking, submitPickup } from "@/lib/actions/requests";
import type { ActionResult } from "@/lib/actions/types";

/**
 * The two forms a customer fills in before any cargo exists.
 *
 * Both are deliberately short. Every extra field on a public form is a reason
 * to close the tab, and everything that actually matters — real weight, real
 * piece count, the price — is established when the boxes reach the counter.
 * What we need here is enough to ring the person back.
 *
 * Field styling is inline rather than borrowed from the staff components: this
 * is the public site, where the input is a wide, calm thing on a phone rather
 * than a dense operational control.
 */

const field =
  "h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-[15px] text-white placeholder:text-white/35 outline-none transition-colors focus:border-brand focus:bg-white/10";
const labelClass = "mb-1.5 block text-sm font-medium text-white/80";

function Done({
  reference,
  title,
  body,
}: {
  reference: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-success/30 bg-success/10 p-8 text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
      <h3 className="mt-4 font-display text-2xl font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/70">{body}</p>
      <p className="mt-5 inline-block rounded-xl border border-white/15 bg-white/5 px-5 py-3">
        <span className="block text-xs uppercase tracking-widest text-white/50">
          Your reference
        </span>
        <span className="mt-1 block font-mono text-xl font-bold text-white">
          {reference}
        </span>
      </p>
      <p className="mt-5 text-xs text-white/50">
        Quote it when you call or message us on WhatsApp.
      </p>
    </div>
  );
}

function Error({ state }: { state: ActionResult<unknown> | undefined }) {
  if (!state || state.ok) return null;
  return (
    <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {state.error}
    </p>
  );
}

export function BookingForm() {
  const [state, action, pending] = useActionState(submitBooking, undefined);

  if (state?.ok && state.data) {
    return (
      <Done
        reference={state.data.reference}
        title="Booking received"
        body="We will contact you to confirm the details and tell you where to send your cargo. Nothing is charged until we have weighed it."
      />
    );
  }

  return (
    <form action={action} className="space-y-5">
      <Error state={state} />

      {/* Honeypot — hidden from people, irresistible to bots. Not named
          "company" here, because this form asks for a real company. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="b-website">Website</label>
        <input id="b-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="b-name">
            Your name
          </label>
          <input id="b-name" name="customerName" className={field} required />
        </div>
        <div>
          <label className={labelClass} htmlFor="b-phone">
            Phone / WhatsApp
          </label>
          <input
            id="b-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="+255 7…"
            className={field}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="b-email">
            Email <span className="text-white/40">(optional)</span>
          </label>
          <input id="b-email" name="email" type="email" className={field} />
        </div>
        <div>
          <label className={labelClass} htmlFor="b-company">
            Business name <span className="text-white/40">(optional)</span>
          </label>
          <input id="b-company" name="company" className={field} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="b-description">
          What are you sending?
        </label>
        <input
          id="b-description"
          name="description"
          placeholder="Clothes, phone accessories, car parts…"
          className={field}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="b-category">
            Type of goods
          </label>
          <select id="b-category" name="cargoCategory" className={field}>
            <option value="NORMAL_GOODS">Normal goods</option>
            <option value="ELECTRONICS">Electronics</option>
            <option value="LIQUID_SPECIAL">Liquids &amp; special</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="b-weight">
            Weight (kg) <span className="text-white/40">approx</span>
          </label>
          <input
            id="b-weight"
            name="estimatedWeightKg"
            inputMode="decimal"
            className={field}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="b-packages">
            How many pieces
          </label>
          <input
            id="b-packages"
            name="packages"
            inputMode="numeric"
            className={field}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="b-origin">
            Sending from
          </label>
          <select id="b-origin" name="origin" className={field}>
            <option value="GUANGZHOU">Guangzhou</option>
            <option value="HONG_KONG">Hong Kong</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="b-wanted">
            Needed in Dar by <span className="text-white/40">(optional)</span>
          </label>
          <input id="b-wanted" name="wantedBy" type="date" className={field} />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
        <input
          type="checkbox"
          name="pickupNeeded"
          className="mt-0.5 h-5 w-5 rounded border-white/30 bg-transparent accent-brand"
        />
        <span className="text-sm text-white/80">
          I need collection from my supplier in China
          <span className="mt-0.5 block text-xs text-white/50">
            We will send a driver. You can also{" "}
            <Link href="/pickup" className="underline">
              request a pickup on its own
            </Link>
            .
          </span>
        </span>
      </label>

      <div>
        <label className={labelClass} htmlFor="b-notes">
          Anything else <span className="text-white/40">(optional)</span>
        </label>
        <textarea id="b-notes" name="notes" rows={3} className={`${field} h-auto py-3`} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-signal px-6 font-semibold text-signal-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60 motion-reduce:hover:translate-y-0 sm:w-auto"
      >
        <Send className="h-4 w-4" />
        {pending ? "Sending…" : "Send booking"}
      </button>
      <p className="text-xs text-white/45">
        This reserves nothing and charges nothing. We reply with where to send
        your cargo and what it will cost once weighed.
      </p>
    </form>
  );
}

export function PickupForm() {
  const [state, action, pending] = useActionState(submitPickup, undefined);

  if (state?.ok && state.data) {
    return (
      <Done
        reference={state.data.reference}
        title="Pickup requested"
        body="Our Guangzhou team will call to agree a time with you or your supplier."
      />
    );
  }

  return (
    <form action={action} className="space-y-5">
      <Error state={state} />

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="p-website">Website</label>
        <input id="p-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="p-name">
            Your name
          </label>
          <input id="p-name" name="customerName" className={field} required />
        </div>
        <div>
          <label className={labelClass} htmlFor="p-phone">
            Phone / WhatsApp
          </label>
          <input
            id="p-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="+255 7…"
            className={field}
            required
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="p-address">
          Pickup address
        </label>
        <input
          id="p-address"
          name="address"
          placeholder="Building, street, district"
          className={field}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="p-city">
            City
          </label>
          <input
            id="p-city"
            name="city"
            defaultValue="Guangzhou"
            className={field}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="p-maps">
            Google Maps link <span className="text-white/40">(optional)</span>
          </label>
          <input
            id="p-maps"
            name="mapsUrl"
            placeholder="Paste a location pin"
            className={field}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="p-description">
          What is being collected?
        </label>
        <input
          id="p-description"
          name="description"
          placeholder="6 cartons of shoes from Baima market"
          className={field}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="p-weight">
            Weight (kg) <span className="text-white/40">approx</span>
          </label>
          <input
            id="p-weight"
            name="estimatedWeightKg"
            inputMode="decimal"
            className={field}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="p-packages">
            How many pieces
          </label>
          <input
            id="p-packages"
            name="packages"
            inputMode="numeric"
            className={field}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="p-when">
            Preferred day
          </label>
          <input id="p-when" name="preferredAt" type="date" className={field} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="p-notes">
          Anything the driver should know{" "}
          <span className="text-white/40">(optional)</span>
        </label>
        <textarea
          id="p-notes"
          name="notes"
          rows={3}
          placeholder="Supplier's name and shop number, best time to call…"
          className={`${field} h-auto py-3`}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-signal px-6 font-semibold text-signal-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60 motion-reduce:hover:translate-y-0 sm:w-auto"
      >
        <Send className="h-4 w-4" />
        {pending ? "Sending…" : "Request pickup"}
      </button>
    </form>
  );
}
