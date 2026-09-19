"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { Bell, ChevronRight, Globe, LogOut, Menu, X } from "lucide-react";
import type { Role } from "@prisma/client";

import { MobileTabbar } from "@/components/app/mobile-tabbar";
import { NavTrail } from "@/components/app/nav-trail";
import { NewVersionNotice } from "@/components/app/new-version-notice";
import { RecordPaymentDialog } from "@/components/app/record-payment-dialog";
import { MobileBack } from "@/components/app/smart-back";
import { NavProvider } from "@/components/app/section-tabs";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { BUILD_ID } from "@/lib/build-id";
import { type NavItem, type NavSection } from "@/lib/nav";
import { LanguageSwitch } from "@/components/app/language-switch";
import { LocaleProvider } from "@/components/app/locale-provider";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

function Glyph({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    name
  ];
  return Icon ? <Icon className={className} /> : null;
}

export function AppShell({
  sections,
  home,
  user,
  unread,
  canRecordPayment = false,
  canClearShortfall = false,
  locale = "en",
  children,
}: {
  /** The language this person reads the system in. */
  locale?: Locale;
  canRecordPayment?: boolean;
  canClearShortfall?: boolean;
  sections: NavSection[];
  /** Where this desk's Home row goes. */
  home: NavItem;
  user: { name: string; email: string; role: Role; roleLabel: string; departmentLabel: string | null };
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const tr = (text: string) => t(locale, text);

  /* The drawer covers the page, so Escape has to take it away again — a
     keyboard user otherwise has no way out but tabbing through every row. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /* LONGEST MATCH WINS, AND ONLY ONE ITEM IS CURRENT.

     Every finance address starts with /app/finance, so a plain prefix test lit
     Overview on every finance screen, Collections beside Verify payments, and
     the Pickup list beside Collected cargo — two departments looking current
     at once. The single item whose address is the closest match is the one
     the reader is on. */
  const matches = (href: string) =>
    !href.startsWith("#") &&
    (pathname === href || pathname.startsWith(`${href}/`));
  const current = [home, ...sections.flatMap((s) => s.items)]
    .map((item) => item.href)
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === current;

  const row = (item: { href: string; icon: string; label: string }) => (
    <Link
      href={item.href}
      onClick={() => setOpen(false)}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        isActive(item.href)
          ? "bg-secondary font-medium text-foreground"
          : "text-foreground/70 hover:bg-secondary/60 hover:text-foreground"
      )}
    >
      <Glyph name={item.icon} className="size-4 shrink-0" />
      <span className="truncate">{tr(item.label)}</span>
    </Link>
  );

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {/* Home stands on its own above everything, because every desk starts and
          returns here and it belongs to no department. */}
      <div>{row(home)}</div>

      {sections.map((section) => (
        <div key={section.label || "top"}>
          {/* A section with no heading is the desk's own top rows, standing
              with Home rather than grouped under a name. */}
          {section.label ? (
            <p className="flex items-center gap-2 px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Glyph name={section.icon} className="size-3.5 shrink-0" />
              {tr(section.label)}
            </p>
          ) : null}
          {/* The rule down the left is what makes a section read as a group
              rather than a heading followed by unrelated rows. */}
          <ul className={section.label ? "ml-[1.1rem] space-y-0.5 border-l pl-2" : "space-y-0.5"}>
            {section.items.map((item) => (
              <li key={item.href}>{row(item)}</li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <LocaleProvider locale={locale}>
    <div className="flex min-h-dvh bg-surface-2">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card lg:flex print:!hidden">
        <div className="flex h-16 items-center border-b px-4">
          <Link href={home.href}>
            <BrandMark size={32} />
          </Link>
        </div>
        {nav}
        <UserFooter user={user} locale={locale} />
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={tr("Close menu")}
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <BrandMark size={32} />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={tr("Close menu")}>
                <X />
              </Button>
            </div>
            {nav}
            <UserFooter user={user} locale={locale} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-3 border-b px-4 pt-[env(safe-area-inset-top)] lg:px-8 print:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={tr("Open menu")}
          >
            <Menu />
          </Button>
          <Link href={home.href} className="lg:hidden">
            <BrandMark size={28} showWordmark={false} />
          </Link>
          <div className="min-w-0 lg:hidden">
            <MobileBack />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {tr(user.departmentLabel ?? user.roleLabel)}
            </span>

            {/* THE WAY OUT TO THE PUBLIC SITE, from every desk. Without it the
                only door out of the app was Sign out. An ordinary in-tab link:
                same origin, so the session stays and coming back lands on the
                desk they left. */}
            <Link
              href="/"
              title={tr("Open the public website — you stay signed in")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-2.5"
            >
              <Globe className="size-[18px]" />
              <span className="hidden sm:inline">{tr("Main site")}</span>
              <span className="sr-only sm:hidden">{tr("Main site")}</span>
            </Link>

            {/* THE BELL BELONGS WHERE PEOPLE LOOK FOR IT. Buried in the menu it
                was a row you scrolled past; up here the count is visible from
                every screen, which is the only reason to keep a count at all. */}
            <Link
              href="/app/notifications"
              aria-label={
                unread > 0
                  ? `${tr("Notifications")}, ${unread}`
                  : tr("Notifications")
              }
              className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Bell className="size-[18px]" />
              {unread > 0 ? (
                <span className="tnum absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-signal px-1 text-[10px] font-semibold leading-[18px] text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>

            <span className="grid size-9 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
              {initials(user.name)}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 print:p-0">
          {/* Records where the reader walked, for every back control. */}
          <Suspense fallback={null}>
            <NavTrail />
          </Suspense>
          {/* Offered, never forced: a clerk half-way through a consignment must
              not have the form pulled out from under them. */}
          <NewVersionNotice build={BUILD_ID} />
          {/* A ceiling on the reading width. On a 2560 screen a table stretched
              edge to edge puts a name and its balance a head-turn apart. */}
          <div className="mx-auto w-full max-w-[1600px]">
            <NavProvider sections={sections}>{children}</NavProvider>
          </div>
        </main>
        {/* The room the bottom bar stands in, so the last row of a list is
            never under it. */}
        <div aria-hidden className="h-[calc(3.5rem_+_env(safe-area-inset-bottom))] lg:hidden print:hidden" />
        <MobileTabbar sections={sections} home={home} role={user.role} onMore={() => setOpen(true)} />
        {/* One dialog for the whole app, opened from any button or any link
            to #record-payment, over whatever screen the desk is on. */}
        {canRecordPayment ? <RecordPaymentDialog canClear={canClearShortfall} /> : null}
      </div>
    </div>
    </LocaleProvider>
  );
}

function UserFooter({
  user,
  locale,
}: {
  user: { name: string; email: string; roleLabel: string };
  locale: Locale;
}) {
  return (
    <div className="border-t p-3">
      {/* Your own name is where everybody looks for their own settings, so it
          is the way in rather than a menu item somebody has to find. */}
      <Link
        href="/app/profile"
        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-secondary"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {t(locale, user.roleLabel)}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
      <div className="mt-1 flex items-center gap-1">
        <form action={logout} className="flex-1">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
          >
            <LogOut />
            {t(locale, "Sign out")}
          </Button>
        </form>
        <ThemeToggle />
      </div>
      {/* English or 中文, one press away on every screen — labelled each in its
          own language, so it is legible to whoever needs it. */}
      <LanguageSwitch current={locale} className="mt-2 w-full [&>button]:flex-1 [&>button]:justify-center" />
    </div>
  );
}
