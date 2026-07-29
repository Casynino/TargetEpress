import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";

import { BrandLockup } from "@/components/brand-mark";
import { COMPANY } from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t bg-muted/30">
      <div className="container py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <BrandLockup />
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              Air freight from Guangzhou and Hong Kong to Dar es Salaam. Cargo
              consolidated in China, flown in verified batches, released only
              against a paid pickup note.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Company</h3>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/services" className="hover:text-foreground">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/track" className="hover:text-foreground">
                  Track shipment
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foreground">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-foreground">
                  Staff login
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Get in touch</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <a href={`tel:${COMPANY.phone}`} className="hover:text-foreground">
                  {COMPANY.phone}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="hover:text-foreground"
                >
                  {COMPANY.email}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>
                  {COMPANY.darAddress}
                  <br />
                  {COMPANY.chinaAddress}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
          </p>
          <p>{COMPANY.tagline}</p>
        </div>
      </div>
    </footer>
  );
}
