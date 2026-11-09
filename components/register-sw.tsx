"use client";

import { useEffect } from "react";

/** Registers /sw.js (it stores nothing; it only makes the app installable in one tap on Android and shows "No internet" when a page cannot load). Production only, so development reloads are never touched. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const go = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}
