"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { QrScanner } from "@/components/app/qr-scanner";
import { Button } from "@/components/ui/button";
import { resolveScan, type ScanResult } from "@/lib/actions/scan";
import { ScanVerdict } from "@/components/app/scan-verdict";
import { formatMoney, formatWeight } from "@/lib/format";

export function ScanWorkbench({ initialCode }: { initialCode?: string }) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handle = useCallback((code: string) => {
    setError(null);
    startTransition(async () => {
      const response = await resolveScan(code);
      if (response.ok && response.data) {
        setResult(response.data);
      } else {
        setResult(null);
        setError(response.ok ? "No shipment found." : response.error);
      }
    });
  }, []);

  // Resolve a code handed in via the URL, once.
  const resolvedInitial = useRef(false);
  useEffect(() => {
    if (initialCode && !resolvedInitial.current) {
      resolvedInitial.current = true;
      handle(initialCode);
    }
  }, [initialCode, handle]);

  if (pending) {
    return (
      <div className="flex items-center justify-center rounded-xl border bg-card p-16 shadow-soft">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (result) {
    return (
      <div className="space-y-4">
        <ScanVerdict
          tone={result.verdict.tone}
          headline={result.verdict.headline}
          detail={result.verdict.detail}
        />

        <div className="rounded-xl border bg-card shadow-soft">
          <div className="border-b p-5">
            <p className="font-mono text-xl font-bold tabular">
              {result.trackingNumber}
            </p>
            <p className="mt-1 text-sm">{result.customerName}</p>
            {result.customerPhone ? (
              <p className="text-xs text-muted-foreground">
                {result.customerPhone}
              </p>
            ) : null}
          </div>

          <dl className="grid gap-px bg-border sm:grid-cols-4">
            {[
              { label: "Status", value: result.statusLabel },
              { label: "Packages", value: String(result.packages) },
              { label: "Weight", value: formatWeight(result.weightKg) },
              { label: "Batch", value: result.batchNumber ?? "—" },
            ].map((item) => (
              <div key={item.label} className="bg-card p-4">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="mt-1 text-sm font-medium">{item.value}</dd>
              </div>
            ))}
          </dl>

          <div className="border-t p-5">
            <p className="text-xs text-muted-foreground">Contents</p>
            <p className="mt-1 text-sm">{result.description}</p>
          </div>

          {result.finance ? (
            <dl className="grid gap-px border-t bg-border sm:grid-cols-3">
              {[
                { label: "Invoice", value: result.finance.invoiceNumber },
                {
                  label: "Paid",
                  value: formatMoney(
                    result.finance.amountPaid,
                    result.finance.currency
                  ),
                },
                {
                  label: "Outstanding",
                  value: formatMoney(
                    result.finance.outstanding,
                    result.finance.currency
                  ),
                },
              ].map((item) => (
                <div key={item.label} className="bg-card p-4">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 font-mono text-sm font-medium tabular">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="brand" onClick={() => setResult(null)}>
            Scan another
          </Button>
          <Button asChild variant="outline">
            <Link href={`/app/cargo/${result.trackingNumber}`}>
              Open shipment
            </Link>
          </Button>
          {result.canRelease ? (
            <Button asChild variant="signal">
              <Link href="/app/release">Go to release</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 shadow-soft">
        <QrScanner
          onResult={handle}
          label="Point the camera at the QR on the cargo label"
        />
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
