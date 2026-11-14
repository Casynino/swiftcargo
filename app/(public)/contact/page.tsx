import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { QuoteForm } from "@/components/site/request-forms";
import { PageHero, PhotoFrame } from "@/components/site/kit";
import { Reveal } from "@/components/site/motion";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { telHref, whatsappLink, WHATSAPP_OPENER } from "@/lib/site-contact";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Call, WhatsApp or email Swift Cargo about sea freight from Guangzhou to Dar es Salaam, or leave your details for a quote.",
  alternates: { canonical: "/contact" },
};

export const revalidate = 300;

export default async function ContactPage() {
  const locale = DEFAULT_LOCALE;
  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
  });
  /* Opens with the greeting already in the box — see lib/site-contact.ts. */
  const whatsapp = whatsappLink(company?.whatsapp, WHATSAPP_OPENER);

  return (
    <>
      <PageHero
        overlap
        photo="traderShop"
        eyebrow={t(locale, "Get in touch")}
        lead={t(locale, "Talk to")}
        trail="Swift Cargo."
        body={
          <p>
            {t(
              locale,
              "Call, message us on WhatsApp, or leave your details and we will send a price."
            )}
          </p>
        }
      />

      <section className="container pb-14 sm:pb-24">
        <div className="relative z-10 -mt-24 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {company?.phone ? (
            <a href={telHref(company.phone)} className="group rounded-2xl border bg-card p-4 transition-colors hover:border-signal/60 sm:p-5">
              <span className="inline-flex text-white/50 transition-colors group-hover:text-signal">
                <Phone className="size-5" />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">{t(locale, "Call us")}</p>
              <p className="tnum mt-1 font-display text-base font-bold sm:text-lg">{company.phone}</p>
              {company.altPhone ? <p className="tnum text-sm text-muted-foreground">{company.altPhone}</p> : null}
            </a>
          ) : null}
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="group rounded-2xl border bg-card p-4 transition-colors hover:border-signal/60 sm:p-5">
              <span className="inline-flex text-white/50 transition-colors group-hover:text-signal">
                <MessageCircle className="size-5" />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">WhatsApp</p>
              <p className="mt-1 font-display text-base font-bold sm:text-lg">{t(locale, "Message us")}</p>
            </a>
          ) : null}
          {company?.email ? (
            <a href={`mailto:${company.email}`} className="group min-w-0 rounded-2xl border bg-card p-4 transition-colors hover:border-signal/60 sm:p-5">
              <span className="inline-flex text-white/50 transition-colors group-hover:text-signal">
                <Mail className="size-5" />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">{t(locale, "Email")}</p>
              <p className="mt-1 break-all text-sm font-semibold sm:text-base">{company.email}</p>
            </a>
          ) : null}
          <Link href="/track" className="group rounded-2xl border bg-card p-4 transition-colors hover:border-signal/60 sm:p-5">
            <span className="inline-flex text-white/50 transition-colors group-hover:text-signal">
              <MapPin className="size-5" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">{t(locale, "Already shipping?")}</p>
            <p className="mt-1 font-display text-base font-bold sm:text-lg">{t(locale, "Track your cargo")}</p>
          </Link>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <Reveal className="rounded-3xl border bg-card p-5 sm:p-8">
            <h2 className="sc-title text-2xl text-white sm:text-3xl">{t(locale, "Ask for a price")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(locale, "Need a collection from a factory?")}{" "}
              <Link href="/pickup" className="font-medium text-brand hover:underline">
                {t(locale, "Request a pickup")}
              </Link>
              {" · "}
              <Link href="/book" className="font-medium text-brand hover:underline">
                {t(locale, "Book space on a sailing")}
              </Link>
            </p>
            <div className="mt-6">
              <QuoteForm />
            </div>
          </Reveal>

          <div className="space-y-6">
            {(
              [
                ["Dar es Salaam office and warehouse", company?.darAddress, "portCranes"],
                ["Guangzhou warehouse", company?.chinaAddress, "guangzhouDusk"],
              ] as const
            )
              .filter(([, address]) => address)
              .map(([place, address, photo], i) => (
                <Reveal key={place} delay={i * 100}>
                  <PhotoFrame name={photo} sizes="(max-width: 1024px) 100vw, 40vw" className="min-h-[15rem] rounded-3xl">
                    <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/40 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                      <p className="sc-label flex items-center gap-2 text-white/75">
                        <MapPin className="size-4" />
                        {t(locale, place)}
                      </p>
                      <p className="mt-2 leading-relaxed">{address}</p>
                    </div>
                  </PhotoFrame>
                </Reveal>
              ))}
          </div>
        </div>
      </section>
    </>
  );
}
