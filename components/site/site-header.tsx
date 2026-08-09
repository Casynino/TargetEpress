"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu, PackageSearch } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandLockup } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { COMPANY } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Is the person reading this already signed in as staff?
 *
 * Read from the hint cookie the middleware leaves — see middleware.ts. It is
 * not a permission check and is not treated as one; it only decides whether
 * this header offers "Login" or a way straight back to the desk somebody was
 * already working at.
 *
 * Done on the client so the public pages stay statically generated. Reading the
 * session on the server would make every marketing page render per request to
 * change one word.
 */
function useStaffHint() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(
      document.cookie.split("; ").some((c) => c === "tx.staff=1")
    );
    // Re-read on navigation: somebody can sign out in this tab and carry on
    // browsing, and the header should stop offering them a dashboard.
  }, [pathname]);

  return signedIn;
}

// Ordered by what a visitor came to do, not by what the company wants to say.
// Booking and pickup lead because they are the two things that turn a reader
// into a customer; the reference pages sit behind them.
/**
 * One word each, all in one language.
 *
 * It was half English and half Swahili, then briefly two words a link — and
 * eight two-word labels is a nav that wraps on a laptop and reads as a
 * sentence. A nav is scanned, not read: the eye wants a shape it can jump
 * between, and every extra word costs it.
 *
 * So one word each, chosen to be unambiguous on a cargo site. "Rates" rather
 * than "Pricing" because that is the freight word, "Guides" rather than "Learn"
 * because the row is otherwise all nouns and one verb in it reads as a button.
 *
 * The Swahili is not gone from the site — the headlines, the promise and the
 * payment instructions are still in it, which is where a customer reads rather
 * than scans.
 */
const NAV = [
  { href: "/book", label: "Book" },
  { href: "/pickup", label: "Pickup" },
  // "Schedules", not "Flights": the page is a timetable with cut-off days,
  // not a list of aircraft, and the route is /schedule.
  { href: "/schedule", label: "Schedules" },
  { href: "/pricing", label: "Rates" },
  { href: "/china", label: "China" },
  { href: "/services", label: "Services" },
  { href: "/learn", label: "Guides" },
  { href: "/contact", label: "Contact" },
];

/**
 * The navigation bar.
 *
 * It used to be an opaque rounded card — `bg-background/85`, which in the light
 * theme is a white pill — sitting on top of a dark hero, with padding above it
 * that let a strip of page background show through as a white band. That is
 * why it read as bolted on: it belonged to neither the hero nor the page.
 *
 * Now it starts transparent and lets the hero run underneath it, then becomes a
 * dark glass bar once you scroll. Every public page opens on a dark hero
 * (PageHero, MediaBand or the homepage Hero — checked, all of them), so white
 * type at the top is legible everywhere without the header having to know which
 * page it is on.
 *
 * The scrolled bar stays dark in both themes rather than following the token.
 * A theme-aware bar means the text colour has to change with it, and a header
 * that inverts halfway down the page is worse than one that simply commits.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const signedIn = useStaffHint();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Threshold rather than `> 0`: a one-pixel scroll should not flip the bar,
    // and a trackpad at rest often reports a pixel or two.
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        // Fixed, not sticky. A sticky header still occupies a row in the flow, so a
        // transparent one reveals the page background above the hero — the white
        // band. Fixed lets the hero photograph run underneath it. Every hero
        // carries enough top padding to clear it.
        "fixed inset-x-0 top-0 z-40 text-white transition-[background-color,border-color,backdrop-filter,box-shadow] duration-300",
        scrolled
          ? "border-b border-white/10 bg-[hsl(220_30%_7%/0.72)] shadow-lift backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="container">
        <nav className="flex items-center justify-between py-3 md:py-4">
          <div className="flex items-center gap-8">
            <Link href="/" aria-label="Target Express Air Cargo — home">
              <BrandLockup />
            </Link>
            <div className="hidden items-center gap-6 md:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative text-sm transition-colors hover:text-gold",
                    pathname === item.href
                      ? "font-semibold text-white after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-full after:bg-gold"
                      : "text-white/65"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle className="h-8 w-8" />
            <Separator orientation="vertical" className="hidden h-6 bg-white/20 sm:block" />
            {/* One door, labelled for whoever is standing at it. Staff who are
                already signed in are not asked to log in again — they are
                offered the desk they left. */}
            <Button
              asChild
              variant="ghost"
              className="hidden h-8 gap-1.5 px-2 text-sm font-normal text-white/65 hover:bg-white/10 hover:text-white md:inline-flex"
            >
              {signedIn ? (
                <Link href="/app/dashboard">
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Dashboard
                </Link>
              ) : (
                <Link href="/login">Login</Link>
              )}
            </Button>
            <Button
              asChild
              variant="signal"
              className="hidden h-8 rounded-full px-3.5 text-sm font-semibold md:inline-flex"
            >
              <Link href="/track">
                <PackageSearch className="mr-1.5 h-4 w-4" />
                Track
              </Link>
            </Button>

            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/10 hover:text-white md:hidden"
                >
                  <Menu className="h-[18px] w-[18px]" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[260px] sm:w-[300px]">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <nav className="mt-6 flex flex-col gap-1">
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted",
                        pathname === item.href
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <Separator className="my-3" />
                  <Button
                    asChild
                    variant="signal"
                    className="w-full rounded-full font-semibold"
                    onClick={() => setOpen(false)}
                  >
                    <Link href="/track">Track</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full rounded-full"
                    onClick={() => setOpen(false)}
                  >
                    <a
                      href={`https://wa.me/${COMPANY.whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      WhatsApp
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    className="w-full justify-start gap-2 text-muted-foreground"
                    onClick={() => setOpen(false)}
                  >
                    {signedIn ? (
                      <Link href="/app/dashboard">
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </Link>
                    ) : (
                      <Link href="/login">Login</Link>
                    )}
                  </Button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </div>
    </header>
  );
}
