"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

/**
 * The colour a phone paints its own bars with (the browser's top bar, Android's
 * status bar), kept equal to the page behind them so the app reads as one full
 * screen rather than a page boxed inside a browser.
 *
 * It follows the app's own night/day switch, not the phone's: the app is dark
 * by default whatever the phone is set to, and a white browser bar over a navy
 * app is exactly the "forced" look the owner flagged (9 Nov 2026). The sign-in
 * scene is always night. Keep these in step with globals.css.
 */
export const BAR_COLOR = { dark: "#0f131c", light: "#fbfcfd", scene: "#05070f" } as const;

export function ThemeColor() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = pathname?.startsWith("/login")
      ? BAR_COLOR.scene
      : resolvedTheme === "light"
        ? BAR_COLOR.light
        : BAR_COLOR.dark;
    const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    if (metas.length) {
      metas.forEach((m) => {
        m.content = color;
        m.removeAttribute("media");
      });
    } else {
      const m = document.createElement("meta");
      m.name = "theme-color";
      m.content = color;
      document.head.appendChild(m);
    }
  }, [resolvedTheme, pathname]);
  return null;
}
