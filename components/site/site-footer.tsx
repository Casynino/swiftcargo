import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ROUTE } from "@/lib/constants";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { telHref, whatsappLink, WHATSAPP_OPENER } from "@/lib/site-contact";

const SHIP = [
  ["/services", "Services"],
  ["/rates", "Shipping rates"],
  ["/calculator", "Price calculator"],
  ["/schedule", "Sailing schedule"],
  ["/china", "Explore China"],
  ["/track", "Track cargo"],
] as const;

const ASK = [
  ["/quote", "Get a quote"],
  ["/book", "Book space"],
  ["/pickup", "Request a pickup"],
  ["/register", "Create an account"],
  ["/about", "About us"],
  ["/contact", "Contact"],
] as const;

export async function SiteFooter() {
  const locale = DEFAULT_LOCALE;
  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
  });
  /* Opens with the greeting already in the box — see lib/site-contact.ts. */
  const whatsapp = whatsappLink(company?.whatsapp, WHATSAPP_OPENER);

  return (
    <footer className="dark relative isolate overflow-hidden border-t border-white/10 bg-[#030a13] text-white/75">
      <div className="container grid gap-10 pb-12 pt-16 sm:pt-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="sc-label flex items-center gap-3 text-white/50">
            {ROUTE.originCity} → {ROUTE.destinationCity}
          </p>
          <p className="sc-title mt-6 text-[2.2rem] text-white sm:text-6xl lg:text-7xl">
            {t(locale, "Ship it.")} <span className="text-white/35">{t(locale, "We bring it home.")}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Link href="/quote" className="sc-btn sc-btn--orange sc-btn--plain">
            {t(locale, "Get a quote")}
          </Link>
          <Link href="/track" className="sc-btn sc-btn--line sc-btn--plain">
            {t(locale, "Track cargo")}
          </Link>
        </div>
      </div>

      <div className="container grid grid-cols-2 gap-x-6 gap-y-10 border-t border-white/10 py-14 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          <BrandMark size={32} />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/55">
            {t(locale, "Sea freight from")} {ROUTE.originCity} {t(locale, "to")} {ROUTE.destinationCity}.{" "}
            {t(locale, "Loose cargo and full containers,")} {ROUTE.transitDaysMin}–{ROUTE.transitDaysMax}{" "}
            {t(locale, "days at sea.")}
          </p>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="sc-link mt-5 text-sm text-white"
            >
              <MessageCircle className="size-4 text-signal" />
              {t(locale, "Message us on WhatsApp")}
            </a>
          ) : null}
        </div>

        <nav aria-label={t(locale, "Shipping")}>
          <p className="sc-label text-white/40">{t(locale, "Shipping")}</p>
          <ul className="mt-5 space-y-3 text-sm">
            {SHIP.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="transition-colors hover:text-signal">
                  {t(locale, label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t(locale, "Work with us")}>
          <p className="sc-label text-white/40">{t(locale, "Work with us")}</p>
          <ul className="mt-5 space-y-3 text-sm">
            {ASK.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="transition-colors hover:text-signal">
                  {t(locale, label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="col-span-2 lg:col-span-1">
          <p className="sc-label text-white/40">{t(locale, "Reach us")}</p>
          <ul className="mt-5 space-y-3 text-sm">
            {company?.phone ? (
              <li className="flex gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0 text-white/40" />
                <span className="tnum">
                  <a href={telHref(company.phone)} className="hover:text-signal">
                    {company.phone}
                  </a>
                  {company.altPhone ? (
                    <a href={telHref(company.altPhone)} className="block hover:text-signal">
                      {company.altPhone}
                    </a>
                  ) : null}
                </span>
              </li>
            ) : null}
            {company?.email ? (
              <li className="flex min-w-0 gap-2.5">
                <Mail className="mt-0.5 size-4 shrink-0 text-white/40" />
                <a href={`mailto:${company.email}`} className="break-all hover:text-signal">
                  {company.email}
                </a>
              </li>
            ) : null}
            {company?.darAddress ? (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-white/40" />
                {company.darAddress}
              </li>
            ) : null}
            {company?.chinaAddress ? (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-white/40" />
                {company.chinaAddress}
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {/* The name, as wide as the page, cut off at the foot like a hull at the waterline. */}
      <div aria-hidden className="pointer-events-none select-none overflow-hidden">
        <p className="sc-title sc-stroke -mb-[0.18em] whitespace-nowrap text-center text-[10.4vw] leading-none opacity-40">
          Swift Cargo
        </p>
      </div>

      <div className="border-t border-white/10">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-white/45">
          <p>
            © {new Date().getFullYear()} {company?.name ?? "Swift Cargo"}
            {company?.tagline ? `. ${company.tagline}.` : "."}
          </p>
          <p>
            <Link href="/login" className="hover:text-white">
              {t(locale, "Sign in")}
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
