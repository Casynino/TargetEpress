"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, PackageSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normaliseCode } from "@/lib/format";

export function TrackForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [pending, setPending] = useState(false);

  // A result has arrived (or the URL changed) — stop the spinner.
  useEffect(() => setPending(false), [params]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCode(query);
    if (!code) return;
    setPending(true);
    router.push(`/track?q=${encodeURIComponent(code)}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <PackageSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="TX-000123 or BATCH-2026-001"
          aria-label="Tracking number or batch number"
          className="h-12 rounded-xl pl-9 font-mono text-sm uppercase tabular placeholder:font-sans placeholder:normal-case"
        />
      </div>
      <Button
        type="submit"
        variant="brand"
        className="h-12 rounded-xl px-8"
        disabled={pending}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Track"}
      </Button>
    </form>
  );
}
