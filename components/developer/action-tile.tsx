"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A tile on the Developer Home that DOES something when pressed (opens a
 * window), looking exactly like the tiles that go somewhere (QuickLink).
 */
export function ActionTile({
  icon: Icon,
  title,
  text,
  tone = "default",
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  tone?: "default" | "success";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring group flex w-full items-start gap-3.5 rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span
          className={cn(
            "mt-0.5 block text-xs leading-relaxed",
            tone === "success"
              ? "font-medium text-success"
              : "text-muted-foreground",
          )}
        >
          {text}
        </span>
      </span>
    </button>
  );
}
