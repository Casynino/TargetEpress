"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";

/**
 * A search box for the Access page. The list is drawn once on the server; this
 * only hides the rows that do not match (by name, email or role) and any group
 * left with none. Nothing is fetched, so it answers as you type.
 */
export function AccessSearch() {
  const t = useT();
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(-1);

  useEffect(() => {
    const needle = q.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll<HTMLElement>("[data-person]").forEach((el) => {
      const hit = !needle || (el.dataset.person ?? "").includes(needle);
      el.style.display = hit ? "" : "none";
      if (hit) visible += 1;
    });
    setShown(visible);
    document.querySelectorAll<HTMLElement>("[data-group]").forEach((group) => {
      const any = [
        ...group.querySelectorAll<HTMLElement>("[data-person]"),
      ].some((el) => el.style.display !== "none");
      group.style.display = any ? "" : "none";
    });
  }, [q]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("Search by name, email or role")}
          aria-label={t("Search accounts")}
          className="h-11 pl-10"
        />
      </div>
      {shown === 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          {t("No account matches that search.")}
        </p>
      )}
    </div>
  );
}
