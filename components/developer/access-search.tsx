"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { CustomerResults } from "@/components/developer/customer-finder";
import { Input } from "@/components/ui/input";

/**
 * The Access page's one search box. Staff are drawn once on the server; this
 * hides the rows that do not match (by name, email or role) and any group left
 * with none. Customers are far too many to draw, so they are fetched as you
 * type — by name, phone number or code — and listed right under the box.
 */
export function AccessSearch() {
  const t = useT();
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(-1);
  const [customers, setCustomers] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

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
          placeholder={t("Search by name, email, phone number or role")}
          aria-label={t("Search accounts")}
          className="h-11 pl-10"
        />
        {loading ? (
          <Loader2 className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      <CustomerResults q={q} onCount={setCustomers} onLoading={setLoading} />
      {shown === 0 && !customers && (
        <p className="px-1 text-sm text-muted-foreground">
          {t("No account matches that search.")}
        </p>
      )}
    </div>
  );
}
