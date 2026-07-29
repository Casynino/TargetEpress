"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the Vercel function logs, keyed by digest.
    console.error("Operations error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Nothing was saved. Try again — if it keeps happening, tell the CEO and
        quote this reference.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {error.digest}
        </p>
      ) : null}
      <Button variant="brand" className="mt-6 rounded-xl" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
