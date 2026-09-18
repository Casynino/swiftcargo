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

export function SiteHeader({
  /**
   * The page under this header opens on one of the dark panels.
   *
   * Every page in app/(public) does, so the bar starts transparent with white
   * type sitting on the picture, and only becomes glass once the reader has
   * scrolled past it. The 404 has no such panel and does not pass this, which
   * is why it is a prop and not something the header assumes.
   */
  overDark = false,
}: {
  overDark?: boolean;
}) {
  const locale = DEFAULT_LOCALE;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<"staff" | "customer" | null>(null);
  const [scrolled, setScrolled] = useState(false);

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

  /* The bar earns its background at the first pixel of scroll. Passive, because
     this listener must never be the reason a phone drops a frame while the
     reader is flicking down the page. */
  useEffect(() => {
    if (!overDark) return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overDark]);

  /* Transparent only while it is actually over the picture: an open menu needs
     a surface under it whatever the page is doing. */
  const onPicture = overDark && !scrolled && !open;

  return (
    <header
      className={cn(
        "z-40 border-b transition-colors duration-300",
        /* Over a picture the bar has to be out of the flow, or "transparent"
           only shows the page behind it and the hero starts underneath. The
           pages in that group reserve the 4rem themselves, at the top of their
           own hero. Everywhere else the bar keeps its place in the column. */
        overDark ? "fixed inset-x-0 top-0" : "sticky top-0",
        onPicture ? "border-transparent bg-transparent text-white" : "glass"
      )}
    >
      <div className="container flex h-16 items-center gap-3 sm:gap-6">
        {/* Over the picture the mark borrows the dark theme's colours, the way
            the footer's does, so the wordmark does not go navy on navy. */}
        <Link href="/" className={cn("focus-ring shrink-0 rounded", onPicture && "dark")}>
          <BrandMark size={34} />
        </Link>

        <nav className="ml-auto hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "focus-ring rounded-md px-3 py-2 text-sm font-medium transition-colors",
                onPicture
                  ? pathname === link.href
                    ? "text-white"
                    : "text-white/70 hover:text-white"
                  : pathname === link.href
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
          <span
            className={cn(
              "hidden min-[360px]:contents",
              onPicture && "[&_button]:text-white [&_button:hover]:bg-white/15"
            )}
          >
            <ThemeToggle />
          </span>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn(
              "hidden sm:inline-flex",
              onPicture && "text-white hover:bg-white/15 hover:text-white"
            )}
          >
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
            className={cn(
              "lg:hidden",
              onPicture && "text-white hover:bg-white/15 hover:text-white"
            )}
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
