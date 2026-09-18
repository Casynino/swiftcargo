import { CheckCircle2, MessageCircle, Phone } from "lucide-react";

import { PhotoFrame } from "@/components/site/kit";
import type { PhotoName } from "@/components/site/photos";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { telHref, whatsappLink, WHATSAPP_OPENER } from "@/lib/site-contact";

/**
 * THE FORM PAGES' BODY: the form on a raised card that rides up over the hero,
 * and a column beside it for somebody who would rather ring.
 */
export function FormShell({
  children,
  side,
}: {
  children: React.ReactNode;
  side?: React.ReactNode;
}) {
  return (
    <section className="container grid gap-8 pb-20 sm:pb-28 lg:grid-cols-[1.45fr_0.8fr]">
      <div className="relative z-10 -mt-24 rounded-[2rem] border bg-card p-5 shadow-[0_40px_80px_-40px_rgba(4,14,26,0.55)] sm:p-8">
        {children}
      </div>
      {side ? <aside className="lg:-mt-24 lg:pt-0">{side}</aside> : null}
    </section>
  );
}

export async function FormSide({ photo = "portYard" }: { photo?: PhotoName }) {
  const locale = DEFAULT_LOCALE;
  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { phone: true, whatsapp: true },
  });
  /* Opens with the greeting already in the box — see lib/site-contact.ts. */
  const whatsapp = whatsappLink(company?.whatsapp, WHATSAPP_OPENER);

  return (
    <div className="relative z-10 space-y-4">
      <PhotoFrame name={photo} sizes="(max-width: 1024px) 100vw, 30vw" className="aspect-[4/3] rounded-[2rem]">
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <p className="font-display text-xl font-bold">{t(locale, "Prefer to talk?")}</p>
          <p className="mt-1 text-sm text-white/75">{t(locale, "Call or message us — we are happy to help.")}</p>
        </div>
      </PhotoFrame>
      <div className="grid gap-3">
        {company?.phone ? (
          <a
            href={telHref(company.phone)}
            className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-brand"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand text-brand-foreground">
              <Phone className="size-4" />
            </span>
            <span>
              <span className="block text-xs text-muted-foreground">{t(locale, "Call us")}</span>
              <span className="tnum font-semibold">{company.phone}</span>
            </span>
          </a>
        ) : null}
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-emerald-500"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-500 text-white">
              <MessageCircle className="size-4" />
            </span>
            <span>
              <span className="block text-xs text-muted-foreground">WhatsApp</span>
              <span className="font-semibold">{t(locale, "Message us")}</span>
            </span>
          </a>
        ) : null}
      </div>
      <ul className="space-y-2.5 rounded-2xl bg-surface-2 p-5 text-sm">
        {[
          "Nothing is charged for asking",
          "Priced from our published rate book",
          "A sailing every Monday",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal" />
            {t(locale, line)}
          </li>
        ))}
      </ul>
    </div>
  );
}
