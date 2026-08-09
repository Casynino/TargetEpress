import type { MetadataRoute } from "next";

import { COMPANY } from "@/lib/constants";

/**
 * The web app manifest.
 *
 * Warehouse staff work this system on a phone all day, and both warehouses add
 * it to the home screen. Without this, that shortcut is a screenshot of the
 * page with a browser chrome bar — the company's own tool, unbranded, sitting
 * next to WhatsApp on the phone of everybody who uses it.
 *
 * Navy theme colour so the Android status bar matches the app shell rather than
 * flashing white on every launch.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: COMPANY.name,
    short_name: COMPANY.shortName,
    description: "Air freight from Guangzhou and Hong Kong to Dar es Salaam.",
    start_url: "/app/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#182A48",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
