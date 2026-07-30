"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Copy-to-clipboard for the China address.
 *
 * Customers forward this to their supplier over WeChat, so the whole point is
 * getting the Chinese text out of the page without retyping it.
 */
export function CopyField({
  value,
  label = "Copy",
  copiedLabel = "Copied",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permission). The text is still
      // on screen and selectable, so this degrades to "select it yourself".
    }
  }

  return (
    <Button
      type="button"
      variant={copied ? "outline" : "signal"}
      onClick={copy}
      className="rounded-xl"
    >
      {copied ? (
        <>
          <Check className="mr-2 h-4 w-4" />
          {copiedLabel}
        </>
      ) : (
        <>
          <Copy className="mr-2 h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  );
}
