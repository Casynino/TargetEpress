"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PackageSearch } from "lucide-react";
import { useState } from "react";

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

// Ordered by what a visitor came to do, not by what the company wants to say.
// Booking and pickup lead because they are the two things that turn a reader
// into a customer; the reference pages sit behind them.
const NAV = [
  { href: "/book", label: "Book" },
  { href: "/pickup", label: "Pickup" },
  { href: "/schedule", label: "Flights" },
  { href: "/pricing", label: "Bei" },
  { href: "/china", label: "Anwani ya China" },
  { href: "/services", label: "Huduma" },
  { href: "/contact", label: "Wasiliana" },
];

/**
 * Floating navigation bar. The structure (rounded card, mobile Sheet menu,
 * theme toggle) comes from the AcmeHero reference component in
 * components/ui/acme-hero.tsx, re-skinned for Target Express.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 pt-3 md:pt-4">
      <div className="container">
        <nav className="flex items-center justify-between rounded-xl border bg-background/85 px-4 py-2 shadow-soft backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
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
                    "text-sm transition-colors hover:text-foreground",
                    pathname === item.href
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle className="h-8 w-8" />
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            <Button
              asChild
              variant="ghost"
              className="hidden h-8 px-2 text-sm font-normal text-muted-foreground hover:text-foreground md:inline-flex"
            >
              <Link href="/login">Staff login</Link>
            </Button>
            <Button
              asChild
              variant="signal"
              className="hidden h-8 rounded-full px-3.5 text-sm font-semibold md:inline-flex"
            >
              <Link href="/track">
                <PackageSearch className="mr-1.5 h-4 w-4" />
                Fuatilia mzigo
              </Link>
            </Button>

            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 md:hidden"
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
                    <Link href="/track">Fuatilia mzigo</Link>
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
                    className="w-full justify-start text-muted-foreground"
                    onClick={() => setOpen(false)}
                  >
                    <Link href="/login">Staff login</Link>
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
