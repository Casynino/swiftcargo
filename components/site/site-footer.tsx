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
  ["/calculator", "CBM calculator"],
  ["/schedule", "Sailing schedule"],
  ["/china", "China sourcing"],
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
    <footer className="border-t bg-ink text-white/80">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          {/* The footer is dark in both themes, so the mark is drawn in its
              dark-theme colours here whatever the reader has chosen. */}
          <span className="dark inline-flex">
            <BrandMark size={32} />
          </span>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/70">
            {t(locale, "Sea freight from")} {ROUTE.originCity} {t(locale, "to")}{" "}
            {ROUTE.destinationCity}.{" "}
            {t(locale, "Loose cargo and full containers,")} {ROUTE.transitDaysMin}–
            {ROUTE.transitDaysMax} {t(locale, "days at sea.")}
          </p>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              <MessageCircle className="size-4" />
              {t(locale, "Message us on WhatsApp")}
            </a>
          ) : null}
        </div>

        <nav aria-label={t(locale, "Shipping")}>
          <p className="eyebrow text-marine">{t(locale, "Shipping")}</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {SHIP.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="hover:text-white">
                  {t(locale, label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t(locale, "Work with us")}>
          <p className="eyebrow text-marine">{t(locale, "Work with us")}</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {ASK.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="hover:text-white">
                  {t(locale, label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="eyebrow text-marine">{t(locale, "Reach us")}</p>
          <ul className="mt-4 space-y-3 text-sm">
            {company?.phone ? (
              <li className="flex gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0 text-marine" />
                <span className="tnum">
                  <a href={telHref(company.phone)} className="hover:text-white">
                    {company.phone}
                  </a>
                  {company.altPhone ? (
                    <a href={telHref(company.altPhone)} className="block hover:text-white">
                      {company.altPhone}
                    </a>
                  ) : null}
                </span>
              </li>
            ) : null}
            {company?.email ? (
              <li className="flex min-w-0 gap-2.5">
                <Mail className="mt-0.5 size-4 shrink-0 text-marine" />
                <a href={`mailto:${company.email}`} className="break-all hover:text-white">
                  {company.email}
                </a>
              </li>
            ) : null}
            {company?.darAddress ? (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-marine" />
                {company.darAddress}
              </li>
            ) : null}
            {company?.chinaAddress ? (
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-marine" />
                {company.chinaAddress}
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-white/50">
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
