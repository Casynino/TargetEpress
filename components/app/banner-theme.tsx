"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useT } from "@/components/app/locale-provider";

/**
 * The night / day switch inside a desk's banner, beside the bell, as on Super
 * Drive. A computer only: a phone has it in the person's menu.
 */
export function BannerTheme() {
  const t = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? t("Switch to light mode") : t("Switch to dark mode");

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={label}
      aria-label={label}
      aria-pressed={dark}
      className="focus-ring hidden size-8 place-items-center rounded-full text-white/65 transition hover:text-white lg:inline-grid"
    >
      {dark ? <Moon className="size-[15px]" /> : <Sun className="size-[15px]" />}
    </button>
  );
}
