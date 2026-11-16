import { Barlow_Condensed } from "next/font/google";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteSky } from "@/components/site/site-sky";

// The lettering of the company's own posters (heavy, condensed, slanted), for the homepage's headline.
// Loaded here, not in the root layout, so the staff app never downloads it.
const poster = Barlow_Condensed({ subsets: ["latin"], weight: ["800"], style: ["italic"], variable: "--font-poster", display: "swap" });

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${poster.variable} site flex min-h-screen flex-col overflow-x-clip`}>
      <SiteSky />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
