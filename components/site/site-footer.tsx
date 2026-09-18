import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ROUTE } from "@/lib/constants";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { telHref, whatsappLink, WHATSAPP_OPENER } from "@/lib/site-contact";

/**
 * THE FOOT OF THE PUBLIC SITE.
 *
 * Dark in both themes, like the hero panels — the bottom of a page is the end
 * of a cover, not another screen of the app. Four columns of the links the site
 * already has, the contact details read from CompanySetting so they change when
 * the company does, and a fine legal line under a rule.
 *
 * Nothing here is written twice. Every address, number and registration comes
 * off the settings row; an address typed into this file is an address that goes
 * wrong the first time the company moves.
 */

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

function Column({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<readonly [string, string]>;
}) {
  const locale = DEFAULT_LOCALE;
  return (
    <nav aria-label={t(locale, title)}>
      <p className="eyebrow text-white/40">{t(locale, title)}</p>
      <ul className="mt-5 space-y-3 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link
              href={href}
              className="focus-ring inline-block rounded text-white/70 transition-colors hover:text-white"
            >
              {t(locale, label)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export async function SiteFooter() {
  const locale = DEFAULT_LOCALE;
  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
  });
  /* Opens with the greeting already in the box — see lib/site-contact.ts. */
  const whatsapp = whatsappLink(company?.whatsapp, WHATSAPP_OPENER);

  return (
    <footer className="relative isolate overflow-hidden border-t bg-ink text-white/80">
      {/* The same light the hero panels carry, so the page closes on the colour
          it opened on rather than on a flat rectangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 100% at 12% 0%, rgba(14,76,135,0.3), transparent 60%)," +
            "radial-gradient(50% 90% at 92% 10%, rgba(42,163,207,0.12), transparent 62%)",
        }}
      />

      <div className="container relative grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8 lg:py-20">
        <div className="lg:col-span-4 lg:pr-8">
          {/* The footer is dark in both themes, so the mark is drawn in its
              dark-theme colours here whatever the reader has chosen. */}
          <span className="dark inline-flex">
            <BrandMark size={34} />
          </span>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/60">
            {t(locale, "Sea freight from")} {ROUTE.originCity} {t(locale, "to")}{" "}
            {ROUTE.destinationCity}.{" "}
            {t(
              locale,
              "Loose cargo and full containers, counted and measured at both ends,"
            )}{" "}
            <span className="tnum">
              {ROUTE.transitDaysMin}–{ROUTE.transitDaysMax}
            </span>{" "}
            {t(locale, "days at sea.")}
          </p>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring mt-6 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
            >
              <MessageCircle className="size-4" />
              {t(locale, "Message us on WhatsApp")}
            </a>
          ) : null}
        </div>

        <div className="lg:col-span-2">
          <Column title="Shipping" links={SHIP} />
        </div>
        <div className="lg:col-span-2">
          <Column title="Work with us" links={ASK} />
        </div>

        <div className="lg:col-span-4">
          <p className="eyebrow text-white/40">{t(locale, "Reach us")}</p>
          <ul className="mt-5 space-y-4 text-sm">
            {company?.phone ? (
              <li className="flex gap-3">
                <Phone className="mt-0.5 size-4 shrink-0 text-marine" />
                <span className="tnum text-white/70">
                  <a href={telHref(company.phone)} className="hover:text-white">
                    {company.phone}
                  </a>
                  {company.altPhone ? (
                    <a
                      href={telHref(company.altPhone)}
                      className="block hover:text-white"
                    >
                      {company.altPhone}
                    </a>
                  ) : null}
                </span>
              </li>
            ) : null}
            {company?.email ? (
              <li className="flex min-w-0 gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-marine" />
                <a
                  href={`mailto:${company.email}`}
                  className="break-all text-white/70 hover:text-white"
                >
                  {company.email}
                </a>
              </li>
            ) : null}
            {company?.darAddress ? (
              <li className="flex gap-3 text-white/70">
                <MapPin className="mt-0.5 size-4 shrink-0 text-marine" />
                <span>
                  <span className="block text-xs uppercase tracking-wide text-white/40">
                    {ROUTE.destinationCity}
                  </span>
                  {company.darAddress}
                </span>
              </li>
            ) : null}
            {company?.chinaAddress ? (
              <li className="flex gap-3 text-white/70">
                <MapPin className="mt-0.5 size-4 shrink-0 text-marine" />
                <span>
                  <span className="block text-xs uppercase tracking-wide text-white/40">
                    {ROUTE.originCity}
                  </span>
                  {company.chinaAddress}
                </span>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="relative border-t border-white/10">
        <div className="container flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-6 text-xs text-white/45">
          <p>
            © {new Date().getFullYear()} {company?.name ?? "Swift Cargo"}
            {company?.tagline ? `. ${company.tagline}.` : "."}
            {company?.tin ? <span className="tnum"> TIN {company.tin}.</span> : null}
          </p>
          <p className="flex items-center gap-5">
            <Link href="/track" className="hover:text-white">
              {t(locale, "Track cargo")}
            </Link>
            <Link href="/login" className="hover:text-white">
              {t(locale, "Sign in")}
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
