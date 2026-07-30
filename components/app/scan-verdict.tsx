"use client";

import { useEffect, useState } from "react";
import { Ban, Check, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The answer to "can I hand this over?", made unmissable.
 *
 * This is read on a cheap Android phone, at arm's length, by someone holding a
 * carton in the other hand, in a warehouse with a customer waiting. So:
 *
 *  - Colour and shape carry the verdict before any text is read. Green circle,
 *    amber triangle, red bar — distinguishable at a glance and not dependent on
 *    colour alone, which matters for the roughly one in twelve men with colour
 *    vision deficiency.
 *  - It vibrates. A hand feels a buzz before eyes focus on a screen, and a
 *    blocked scan gets a distinct double pulse so "stop" is never mistaken for
 *    "go" in a noisy room.
 *  - The animation is 300ms and never gates the information. The text is
 *    readable on the first frame; the motion only draws the eye to it.
 */
export function ScanVerdict({
  tone,
  headline,
  detail,
}: {
  tone: "ok" | "warn" | "block";
  headline: string;
  detail: string;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEntered(calm ? true : false);

    // A blocked scan buzzes twice, long. "Do not release this" has to feel
    // different from "go ahead" without looking.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(
          tone === "block" ? [90, 70, 90, 70, 90] : tone === "warn" ? [60, 60, 60] : 40
        );
      } catch {
        // Vibration is a nicety; a browser refusing it changes nothing.
      }
    }

    if (calm) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [tone]);

  const skin = {
    ok: {
      panel: "border-success/40 bg-success/5",
      badge: "bg-success text-white",
      text: "text-success",
      Icon: Check,
    },
    warn: {
      panel: "border-warning/40 bg-warning/5",
      badge: "bg-warning text-white",
      text: "text-warning",
      Icon: TriangleAlert,
    },
    block: {
      panel: "border-destructive/50 bg-destructive/5",
      badge: "bg-destructive text-white",
      text: "text-destructive",
      Icon: Ban,
    },
  }[tone];

  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn(
        "flex items-center gap-4 rounded-xl border-2 p-5 transition-all duration-300 ease-out",
        skin.panel,
        entered ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
      )}
    >
      <span
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-transform duration-300 ease-out",
          skin.badge,
          entered ? "scale-100" : "scale-75"
        )}
      >
        <skin.Icon className="h-8 w-8" strokeWidth={3} />
      </span>
      <div className="min-w-0">
        <p className={cn("font-display text-xl font-bold leading-tight", skin.text)}>
          {headline}
        </p>
        <p className="mt-1 text-sm opacity-90">{detail}</p>
      </div>
    </div>
  );
}
