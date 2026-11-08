"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Icons from "lucide-react";
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Globe, LogOut, Menu, Search, X } from "lucide-react";
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

  /* WHICH SECTIONS ARE UNFOLDED.

     The one holding the page you are on opens by itself, and opens again when
     you move to another; the rest stay folded until pressed, so a desk with
     five departments shows five lines, not thirty. What was pressed is
     remembered for as long as the page is open. On Home, the first section is
     the one shown.

     A short menu is not folded at all: a floor clerk with ten rows in all
     should see every one of them without pressing anything, because the row
     they need ten times an hour — Receive cargo — must never be behind a fold. */
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const labelled = sections.filter((s) => s.label);
  const shortMenu = sections.reduce((n, s) => n + s.items.length, 0) <= 14;
  const here = sections.find((s) => s.label && s.items.some((i) => i.href === current))?.label;
  const isOpen = (s: NavSection) =>
    s.label in pressed ? pressed[s.label] : shortMenu || s.label === (here ?? labelled[0]?.label);
  const toggle = (s: NavSection) => setPressed((p) => ({ ...p, [s.label]: !isOpen(s) }));
  useEffect(() => {
    if (here) setPressed((p) => (p[here] === true ? p : { ...p, [here]: true }));
  }, [here]);

  /* THE RAIL CAN SHRINK TO ICONS. What was chosen is kept in this browser, and
     the page always starts wide so the first paint matches the server's. */
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("swift.sidebar") === "collapsed") setCollapsed(true);
    } catch {
      /* private window or blocked storage: it simply starts wide */
    }
  }, []);
  const setRail = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem("swift.sidebar", next ? "collapsed" : "wide");
    } catch {
      /* same */
    }
  };

  /* SEARCH THE MENU. Every row this person may open, found by what it is called
     — in their own language or in English. Enter goes to the first one; Ctrl or
     Cmd + K gets to the box from anywhere on a computer. */
  const router = useRouter();
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const every = [
    { item: home as { href: string; icon: string; label: string }, where: "" },
    ...sections.flatMap((s) => s.items.map((item) => ({ item, where: s.label }))),
  ];
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? every.filter(({ item }) => tr(item.label).toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle))
    : [];
  const focusSearch = () => {
    if (collapsed) setRail(false);
    setTimeout(() => searchRef.current?.focus(), 60);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && window.matchMedia("(min-width: 1024px)").matches) {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);
  const go = (href: string) => {
    setQ("");
    setOpen(false);
    router.push(href);
  };

  const row = (item: { href: string; icon: string; label: string }) => (
    <Link
      href={item.href}
      onClick={() => setOpen(false)}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-1.5 text-[13px] transition-all",
        isActive(item.href)
          ? "bg-gradient-to-r from-brand/15 to-brand/5 font-medium text-foreground shadow-sm ring-1 ring-inset ring-brand/30"
          : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
      )}
    >
      <Glyph name={item.icon} className="size-4 shrink-0" />
      <span className="truncate">{tr(item.label)}</span>
    </Link>
  );

  /* The box at the top of the menu. */
  const searchBox = (ref?: React.Ref<HTMLInputElement>, hint = false) => (
    <div className="px-3 pt-3">
      <label className="flex h-10 items-center gap-2.5 rounded-xl border border-border/60 bg-background/50 px-3 text-sm focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) go(hits[0].item.href);
            if (e.key === "Escape") setQ("");
          }}
          placeholder={tr("Search pages")}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
        {hint ? (
          <kbd className="hidden rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground xl:inline">⌘K</kbd>
        ) : null}
      </label>
    </div>
  );

  const searchResults = (
    <ul className="space-y-0.5">
      {hits.length === 0 ? (
        <li className="px-3 py-6 text-center text-xs text-muted-foreground">{tr("Nothing found")}</li>
      ) : (
        hits.map(({ item, where }) => (
          <li key={`${where}-${item.href}-${item.label}`}>
            <button
              type="button"
              onClick={() => go(item.href)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-[13px] text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              <Glyph name={item.icon} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{tr(item.label)}</span>
              {where ? <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{tr(where)}</span> : null}
            </button>
          </li>
        ))
      )}
    </ul>
  );

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
      {needle ? (
        searchResults
      ) : (
        <>
          {/* Home stands on its own above everything, because every desk starts and
              returns here and it belongs to no department. */}
          <div>{row(home)}</div>

          {sections.map((section) => {
            /* A section with no heading is the desk's own top rows, standing with
               Home rather than grouped under a name, and so is never folded away. */
            const folds = !!section.label;
            const shown = !folds || isOpen(section);
            return (
              <div key={section.label || "top"}>
                {folds ? (
                  <button
                    type="button"
                    onClick={() => toggle(section)}
                    aria-expanded={shown}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                  >
                    <Glyph name={section.icon} className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{tr(section.label)}</span>
                    <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", !shown && "-rotate-90")} />
                  </button>
                ) : null}
                {/* The rule down the left is what makes a section read as a group
                    rather than a heading followed by unrelated rows. */}
                {shown ? (
                  <ul className={folds ? "ml-[1.35rem] mt-0.5 space-y-0.5 border-l border-border/60 pl-2" : "space-y-0.5"}>
                    {section.items.map((item) => (
                      <li key={item.href}>{row(item)}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </>
      )}
    </nav>
  );

  /* The same menu squeezed to icons: Home, then one icon per section (lit when
     it holds the page you are on). Pressing a section opens the rail wide on
     that section, so nothing is a guess. */
  const railIcon = "grid size-11 place-items-center rounded-xl transition-all";
  const rail = (
    <nav className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto px-2 py-3">
      <button type="button" onClick={focusSearch} title={`${tr("Search pages")}  (Ctrl K)`} aria-label={tr("Search pages")} className={cn(railIcon, "text-muted-foreground hover:bg-foreground/5 hover:text-foreground")}>
        <Search className="size-[18px]" />
      </button>
      <span aria-hidden className="my-1 h-px w-6 bg-border/70" />
      <Link
        href={home.href}
        title={tr(home.label)}
        aria-label={tr(home.label)}
        className={cn(railIcon, isActive(home.href) ? "bg-gradient-to-br from-brand/20 to-brand/5 text-foreground ring-1 ring-inset ring-brand/30" : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground")}
      >
        <Glyph name={home.icon} className="size-[18px]" />
      </Link>
      {sections.map((section) =>
        section.label ? (
          <button
            key={section.label}
            type="button"
            title={tr(section.label)}
            aria-label={tr(section.label)}
            onClick={() => {
              setPressed((p) => ({ ...p, [section.label]: true }));
              setRail(false);
            }}
            className={cn(railIcon, here === section.label ? "bg-gradient-to-br from-brand/20 to-brand/5 text-foreground ring-1 ring-inset ring-brand/30" : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground")}
          >
            <Glyph name={section.icon} className="size-[18px]" />
          </button>
        ) : (
          section.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={tr(item.label)}
              aria-label={tr(item.label)}
              className={cn(railIcon, isActive(item.href) ? "bg-gradient-to-br from-brand/20 to-brand/5 text-foreground ring-1 ring-inset ring-brand/30" : "text-foreground/70 hover:bg-foreground/5 hover:text-foreground")}
            >
              <Glyph name={item.icon} className="size-[18px]" />
            </Link>
          ))
        )
      )}
    </nav>
  );

  return (
    <LocaleProvider locale={locale}>
    <div
      className="flex min-h-dvh max-w-full touch-pan-x touch-pan-y overflow-x-clip bg-surface-2 print:max-w-none print:overflow-visible"
      style={{ backgroundImage: "radial-gradient(46rem 34rem at 0% 0%, hsl(var(--brand) / 0.10), transparent 70%), radial-gradient(40rem 30rem at 100% 100%, hsl(var(--brand) / 0.06), transparent 70%)" }}
    >
      {/* Desktop rail: a floating glass panel that can shrink to icons. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 p-3 transition-[width] duration-300 ease-out lg:block print:!hidden",
          collapsed ? "w-[5.5rem]" : "w-[18.5rem]"
        )}
      >
        <div className="relative flex h-full flex-col rounded-[28px] border border-border/60 bg-card/75 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-card/60">
          <button
            type="button"
            onClick={() => setRail(!collapsed)}
            aria-label={collapsed ? tr("Expand menu") : tr("Collapse menu")}
            title={collapsed ? tr("Expand menu") : tr("Collapse menu")}
            className="absolute -right-3 top-7 z-10 grid size-7 place-items-center rounded-full border border-border bg-background text-foreground shadow-md transition-transform hover:scale-110"
          >
            <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
          </button>
          <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center px-2" : "px-4")}>
            <Link href={home.href} aria-label={tr(home.label)}>
              <BrandMark size={32} showWordmark={!collapsed} />
            </Link>
          </div>
          {collapsed ? rail : (
            <>
              {searchBox(searchRef, true)}
              {nav}
            </>
          )}
          <UserFooter user={user} locale={locale} compact={collapsed} />
        </div>
      </aside>

      {/* Mobile drawer: the same glass panel, floating off the edge. */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={tr("Close menu")}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <aside className="drawer-in absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 top-[max(0.75rem,env(safe-area-inset-top))] flex w-72 max-w-[85vw] flex-col rounded-[28px] border border-border/60 bg-background/90 shadow-2xl backdrop-blur-xl dark:border-white/10">
            <div className="flex h-16 shrink-0 items-center justify-between px-4">
              <BrandMark size={32} />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={tr("Close menu")}>
                <X />
              </Button>
            </div>
            {searchBox()}
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

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8 print:p-0">
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
  compact = false,
}: {
  user: { name: string; email: string; role: Role; roleLabel: string };
  locale: Locale;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1.5 p-2 pb-3">
        <span aria-hidden className="mb-1 h-px w-6 bg-border/70" />
        <ThemeToggle />
        <form action={logout}>
          <button
            type="submit"
            title={t(locale, "Sign out")}
            aria-label={t(locale, "Sign out")}
            className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <LogOut className="size-[18px]" />
          </button>
        </form>
        <Link
          href="/app/profile"
          title={user.name}
          aria-label={user.name}
          className="relative grid size-10 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground"
        >
          {initials(user.name)}
          <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-500" />
        </Link>
      </div>
    );
  }
  return (
    <div className="shrink-0 p-3">
      <div className="rounded-2xl border border-border/60 bg-background/40 p-2 dark:border-white/10">
        {/* Your own name is where everybody looks for their own settings, so it
            is the way in rather than a menu item somebody has to find. */}
        <Link
          href="/app/profile"
          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-foreground/5"
        >
          <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
            {initials(user.name)}
            <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-500" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{t(locale, user.roleLabel)}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
        <div className="mt-1 flex items-center gap-1">
          <form action={logout} className="flex-1">
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
              <LogOut />
              {t(locale, "Sign out")}
            </Button>
          </form>
          <ThemeToggle />
        </div>
        {/* English or 中文, one press away on every screen — labelled each in its
            own language, so it is legible to whoever needs it. */}
        <LanguageSwitch current={locale} className="mt-1.5 w-full [&>button]:flex-1 [&>button]:justify-center" />
      </div>
    </div>
  );
}
