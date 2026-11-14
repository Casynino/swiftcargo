"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, LayoutDashboard, UserRound } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/services", label: "Services" },
  { href: "/rates", label: "Rates" },
  { href: "/calculator", label: "Price calculator" },
  { href: "/schedule", label: "Schedule" },
  { href: "/china", label: "Explore China" },
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

  /* The phone menu covers the screen; the page under it must not scroll. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Every public page opens on a photograph, and the header floats over it
     until the page is scrolled; then it becomes a dark frosted bar. */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const account = signedIn ? home : "/login";
  const accountLabel = signedIn === "staff" ? "My desk" : signedIn ? "My account" : "Sign in";
  const AccountIcon = signedIn === "staff" ? LayoutDashboard : signedIn ? UserRound : null;

  return (
    <header
      className={cn(
        "dark fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)] text-white transition-[background-color,border-color] duration-500",
        scrolled && !open
          ? "border-b border-white/10 bg-[rgba(3,10,19,0.72)] backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="container flex h-16 items-center gap-3 sm:h-[4.5rem] sm:gap-6">
        <Link href="/" className="focus-ring relative z-10 shrink-0 rounded">
          <BrandMark size={34} />
        </Link>

        <nav className="ml-auto hidden items-center gap-7 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "focus-ring relative py-1 text-[13px] font-medium transition-colors",
                "after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:bg-signal after:transition-transform after:duration-500",
                pathname === link.href
                  ? "text-white after:scale-x-100"
                  : "text-white/65 after:scale-x-0 hover:text-white hover:after:scale-x-100"
              )}
            >
              {t(locale, link.label)}
            </Link>
          ))}
        </nav>

        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2 lg:ml-2">
          <Link
            href="/track"
            className="focus-ring hidden h-10 items-center px-2 text-[13px] font-medium text-white/75 transition-colors hover:text-white sm:inline-flex"
          >
            {t(locale, "Track cargo")}
          </Link>
          <Link
            href={account}
            className="focus-ring inline-flex h-10 items-center gap-1.5 px-2 text-[13px] font-semibold text-white underline decoration-signal decoration-2 underline-offset-[6px] transition-colors hover:text-signal"
          >
            {AccountIcon ? <AccountIcon className="size-4" /> : null}
            {t(locale, accountLabel)}
          </Link>
          {/* Two lines that become a cross: the way to the rest of the site on a phone. */}
          <button
            type="button"
            className="focus-ring relative -mr-2 grid size-10 place-items-center lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? t(locale, "Close menu") : t(locale, "Open menu")}
            aria-expanded={open}
            aria-controls="site-menu"
          >
            <span
              aria-hidden
              className={cn(
                "absolute h-[1.5px] w-6 bg-white transition-transform duration-300",
                open ? "rotate-45" : "-translate-y-[4px]"
              )}
            />
            <span
              aria-hidden
              className={cn(
                "absolute h-[1.5px] w-6 bg-white transition-transform duration-300",
                open ? "-rotate-45" : "translate-y-[4px]"
              )}
            />
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="site-menu"
          className="fixed inset-0 -z-10 flex flex-col bg-[#030a13] pt-[calc(env(safe-area-inset-top)+5rem)] lg:hidden"
        >
          <ul className="container flex-1 overflow-y-auto">
            {[...LINKS, { href: "/track", label: "Track cargo" }].map((link, i) => (
              <li key={link.href} className="sc-menu-item border-b border-white/10" style={{ ["--i" as string]: i }}>
                <Link href={link.href} onClick={() => setOpen(false)} className="group flex items-center gap-4 py-4">
                  <span className="tnum w-5 font-mono text-[11px] text-white/35">{String(i + 1).padStart(2, "0")}</span>
                  <span
                    className={cn(
                      "sc-title flex-1 text-[1.45rem] transition-colors",
                      pathname === link.href ? "text-signal" : "text-white group-hover:text-signal"
                    )}
                  >
                    {t(locale, link.label)}
                  </span>
                  <ArrowUpRight className="size-4 text-white/30" />
                </Link>
              </li>
            ))}
          </ul>
          <div
            className="sc-menu-item container grid grid-cols-2 gap-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6"
            style={{ ["--i" as string]: 9 }}
          >
            <Link href="/quote" onClick={() => setOpen(false)} className="sc-btn sc-btn--orange sc-btn--plain justify-center">
              {t(locale, "Get a quote")}
            </Link>
            <Link href="/register" onClick={() => setOpen(false)} className="sc-btn sc-btn--line sc-btn--plain justify-center">
              {t(locale, "Create account")}
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
