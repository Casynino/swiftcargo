import Link from "next/link";
import type { Metadata } from "next";
import { SearchX } from "lucide-react";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * An address that does not exist on the public site.
 *
 * Rendered with the site's own header and footer, because the root layout has
 * neither, and a bare 404 is a dead end for somebody who followed an old link
 * off a WhatsApp message.
 */
export default function NotFound() {
  const locale = DEFAULT_LOCALE;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="container flex flex-1 flex-col items-center justify-center py-20 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <SearchX className="size-7" />
        </span>
        <p className="mt-5 font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {t(locale, "We could not find that page")}
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          {t(locale, "The link may be old or mistyped. If you are looking for your cargo, track it by its reference.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/track">{t(locale, "Track cargo")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">{t(locale, "Home")}</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
