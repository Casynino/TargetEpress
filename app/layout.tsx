import type { Metadata, Viewport } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";

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
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
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
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
