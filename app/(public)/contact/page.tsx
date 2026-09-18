import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { QuoteForm } from "@/components/site/request-forms";
import { Card } from "@/components/ui/card";
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
    <div className="container max-w-5xl py-16">
      <p className="eyebrow text-marine">{t(locale, "Get in touch")}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        {t(locale, "Talk to Swift Cargo")}
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {t(
          locale,
          "Call us, message us on WhatsApp, or leave your details and we will come back with a price."
        )}
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          {company?.phone ? (
            <Card className="p-6">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Phone className="size-4 text-signal" />
                {t(locale, "Call us")}
              </p>
              <a href={telHref(company.phone)} className="tnum mt-3 block text-lg font-medium hover:text-brand">
                {company.phone}
              </a>
              {company.altPhone ? (
                <a href={telHref(company.altPhone)} className="tnum block text-lg font-medium hover:text-brand">
                  {company.altPhone}
                </a>
              ) : null}
            </Card>
          ) : null}

          {whatsapp ? (
            <Card className="p-6">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MessageCircle className="size-4 text-signal" />
                WhatsApp
              </p>
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground hover:bg-brand/90"
              >
                {t(locale, "Message us")}
              </a>
            </Card>
          ) : null}

          {company?.email ? (
            <Card className="p-6">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Mail className="size-4 text-signal" />
                {t(locale, "Email")}
              </p>
              <a href={`mailto:${company.email}`} className="mt-3 block break-all text-sm hover:text-brand">
                {company.email}
              </a>
            </Card>
          ) : null}

          {company?.darAddress ? (
            <Card className="p-6">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-signal" />
                {t(locale, "Dar es Salaam office and warehouse")}
              </p>
              <p className="mt-3 text-sm leading-relaxed">{company.darAddress}</p>
            </Card>
          ) : null}

          {company?.chinaAddress ? (
            <Card className="p-6">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-signal" />
                {t(locale, "Guangzhou warehouse")}
              </p>
              <p className="mt-3 text-sm leading-relaxed">{company.chinaAddress}</p>
            </Card>
          ) : null}
        </div>

        <div className="lg:col-span-3">
          <h2 className="text-lg font-semibold">{t(locale, "Ask for a price")}</h2>
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
          <div className="mt-4">
            <QuoteForm />
          </div>
        </div>
      </div>
    </div>
  );
}
