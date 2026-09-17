"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/services", label: "Services" },
  { href: "/rates", label: "Rates" },
  { href: "/calculator", label: "CBM calculator" },
  { href: "/schedule", label: "Sailings" },
  { href: "/china", label: "China sourcing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const locale = DEFAULT_LOCALE;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<"staff" | "customer" | null>(null);

  /*
    A HINT, NOT A CREDENTIAL.

    The public site is statically generated, so it cannot know who is reading
    it — which is why the header used to say "Sign in" to somebody already
    signed in. The middleware leaves a non-httpOnly cookie saying only that a
    session exists and which shell it belongs to. It grants nothing: the worst a
    stale one can do is show a link that bounces to the login page, which is
    what happens without it anyway.
  */
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)swc\.session=(staff|customer)/);
    setSignedIn(match ? (match[1] as "staff" | "customer") : null);
  }, [pathname]);

  const home = signedIn === "staff" ? "/app/dashboard" : "/portal";

  /* A menu left open over the page it just navigated to hides that page. */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="glass sticky top-0 z-40 border-b">
      <div className="container flex h-16 items-center gap-3 sm:gap-6">
        <Link href="/" className="focus-ring shrink-0 rounded">
          <BrandMark size={34} />
        </Link>

        <nav className="ml-auto hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "focus-ring rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === link.href
                  ? "text-brand"
                  : "text-foreground/70 hover:text-foreground"
              )}
            >
              {t(locale, link.label)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:ml-0">
          {/* The toggle gives way first on the narrowest phones; the menu and
              sign-in are what somebody at 320 pixels came for. */}
          <span className="hidden min-[360px]:contents">
            <ThemeToggle />
          </span>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/track">{t(locale, "Track cargo")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={signedIn ? home : "/login"}>
              {signedIn ? t(locale, "My account") : t(locale, "Sign in")}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? t(locale, "Close menu") : t(locale, "Open menu")}
            aria-expanded={open}
            aria-controls="site-menu"
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {open ? (
        <nav id="site-menu" className="border-t bg-card lg:hidden">
          <ul className="container grid gap-1 py-3">
            {[...LINKS, { href: "/track", label: "Track cargo" }].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-sm font-medium hover:bg-secondary"
                >
                  {t(locale, link.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
