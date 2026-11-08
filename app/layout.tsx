import type { Metadata, Viewport } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";

import { ThemeColor } from "@/components/theme-color";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { COMPANY } from "@/lib/constants";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

// iPhone screens (points wide, high, pixel ratio) with a launch picture in
// public/brand/splash: the home-screen app opens on the night ground and the
// app tile instead of a white flash.
const SPLASH = [
  [440, 956, 3], [430, 932, 3], [428, 926, 3], [420, 912, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3],
  [402, 874, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [375, 667, 2], [320, 568, 2],
] as const;

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // Shares one source with the sitemap and robots file. Defaulting to
  // localhost here is how a production build ends up publishing canonical
  // URLs and share images that point at a laptop.
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${COMPANY.name} — Air cargo from China to Tanzania`,
    template: `%s · ${COMPANY.shortName}`,
  },
  description:
    "Air freight from Guangzhou and Hong Kong to Dar es Salaam. Track every shipment from the China warehouse to collection in Tanzania.",
  openGraph: {
    title: COMPANY.name,
    description:
      "Air freight from Guangzhou and Hong Kong to Dar es Salaam, with live shipment tracking.",
    type: "website",
  },
  // "Add to Home Screen" opens it full screen, like an app: the page runs
  // under the phone's status bar, with the strip below keeping the clock
  // readable (owner, 9 Nov 2026).
  appleWebApp: {
    capable: true,
    title: COMPANY.shortName,
    statusBarStyle: "black-translucent",
    startupImage: SPLASH.map(([w, h, r]) => ({
      url: `/brand/splash/${w}x${h}@${r}.png`,
      media: `screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
    })),
  },
  formatDetection: { telephone: false },
};

/*
  Edge to edge on a phone (viewport-fit=cover); the pages keep their own safe
  margins. The bar colour starts as night, the app's default, and ThemeColor
  moves it with the app's own switch — the phone's light or dark setting does
  not decide what this app looks like, so it must not decide the bar either.
*/
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f131c",
  // Says the app draws its own night and day, so Samsung Internet, Huawei's
  // browser and Chrome's "darken websites" leave its colours alone.
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${sora.variable} ${mono.variable} font-sans`}
      >
        {/* Dark by default, and the toggle is how somebody leaves it.

            enableSystem is off deliberately. With it on, "default" means the
            visitor's operating system decides — so a customer on a light phone
            would open the site in light whatever we set here, and the choice
            would not be ours to make. The warehouse floor, the counter and the
            phone in a van all read this in the dark. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ThemeColor />
          <div aria-hidden className="status-strip" />
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
