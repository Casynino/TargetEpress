import Link from "next/link";
import { Instagram, Mail, MapPin, Phone, Smartphone } from "lucide-react";

import { BrandLockup } from "@/components/brand-mark";
import { COMPANY } from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t bg-muted/30">
      <div className="container py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <BrandLockup />
            <p className="mt-4 font-display text-lg font-semibold">
              {COMPANY.promiseSw}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {COMPANY.promiseEn} Air cargo from Guangzhou and Hong Kong to Dar
              es Salaam — {COMPANY.taglineEn.toLowerCase()}.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={COMPANY.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:text-signal"
              >
                <Instagram className="h-4 w-4" />@{COMPANY.instagram}
              </a>
              <a
                href={COMPANY.iosApp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:text-signal"
              >
                <Smartphone className="h-4 w-4" />
                iPhone app
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Kurasa</h3>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/china" className="hover:text-foreground">
                  Anwani ya China
                </Link>
              </li>
              <li>
                <Link href="/china/markets" className="hover:text-foreground">
                  Masoko ya China
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-foreground">
                  Bei zetu
                </Link>
              </li>
              <li>
                <Link href="/services/sourcing" className="hover:text-foreground">
                  Tunanunua kwa niaba yako
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-foreground">
                  Huduma na bei
                </Link>
              </li>
              <li>
                <Link href="/track" className="hover:text-foreground">
                  Fuatilia mzigo
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foreground">
                  Wasiliana nasi
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-foreground">
                  Staff Login
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Wasiliana</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                <span>
                  <a
                    href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}
                    className="block hover:text-foreground"
                  >
                    {COMPANY.phone}
                  </a>
                  <a
                    href={`tel:${COMPANY.phoneAlt.replace(/\s/g, "")}`}
                    className="block hover:text-foreground"
                  >
                    {COMPANY.phoneAlt}
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="hover:text-foreground"
                >
                  {COMPANY.email}
                </a>
              </li>
              {COMPANY.offices.map((office) => (
                <li key={office.id} className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                  <span>
                    <span className="font-medium text-foreground">
                      {office.name}
                    </span>
                    <br />
                    {office.address}
                  </span>
                </li>
              ))}
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>
                  <span className="font-medium text-foreground">
                    Guangzhou warehouse
                  </span>
                  <br />
                  {COMPANY.chinaOffice.addressEn}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>
            © {new Date().getFullYear()} {COMPANY.name}. Haki zote zimehifadhiwa.
          </p>
          <p>{COMPANY.taglineSw}</p>
        </div>
      </div>
    </footer>
  );
}
