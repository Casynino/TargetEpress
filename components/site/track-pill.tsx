"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";

import { normaliseCode } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Tracking in one line: a number and a button. It sits just under the
 * homepage's scene, not in it (owner, 16 Nov 2026: in the scene it was "too
 * much" and spoiled the clean first screen). Still a field rather than a link:
 * tracking is the commonest reason anyone opens this site, and sending someone
 * to another page to type a number already in their hand is a step for nothing.
 */
export function TrackPill({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCode(query);
    if (!code) return;
    router.push(`/track?q=${encodeURIComponent(code)}`);
  }

  return (
    <form onSubmit={onSubmit} className={cn("flex items-center gap-2 rounded-full border bg-card p-1.5 pl-4 transition-colors focus-within:border-brand/60", className)}>
      <label htmlFor="home-track" className="sr-only">
        Fuatilia mzigo wako
      </label>
      <PackageSearch aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
      <input
        id="home-track"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="TX-000123"
        autoComplete="off"
        className="h-10 min-w-0 flex-1 bg-transparent font-mono text-[16px] uppercase tabular outline-none placeholder:text-muted-foreground/70"
      />
      <button
        type="submit"
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#D81E2A] px-4 text-sm font-semibold text-white transition-[filter] hover:brightness-110"
      >
        Track
        <ArrowRight className="size-4" />
      </button>
    </form>
  );
}
