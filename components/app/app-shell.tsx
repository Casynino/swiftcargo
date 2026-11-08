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
import { ShellContext, useShell } from "@/components/app/shell-context";
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
  /* Today, short, for the phone bar. Filled in after load so the server and the
     browser never disagree about what day it is. */
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Dar_es_Salaam" }).format(new Date()));
  }, []);
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
        "relative flex items-center gap-3 rounded-xl px-3 py-1 text-[13px] transition-all",
        isActive(item.href)
          ? "bg-foreground/5 font-medium text-foreground before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-full before:bg-[#e3b341]"
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
      <label className="flex h-9 items-center gap-2.5 border-b border-border/60 px-1 text-sm transition-colors focus-within:border-[#e3b341]/70">
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
              returns here and it belongs to no department. A section with no
              heading is the desk's own top rows and stands with it. */}
          <p className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">{tr("Main")}</p>
          <div>{row(home)}</div>
          {sections
            .filter((section) => !section.label)
            .map((section) => (
              <ul key="top" className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>{row(item)}</li>
                ))}
              </ul>
            ))}

          {labelled.length > 0 ? (
            <p className="mt-3 px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">{tr("Workspace")}</p>
          ) : null}
          {labelled.map((section) => {
            const shown = isOpen(section);
            return (
              <div key={section.label}>
                <button
                  type="button"
                  onClick={() => toggle(section)}
                  aria-expanded={shown}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-[13px] font-medium text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <Glyph name={section.icon} className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{tr(section.label)}</span>
                  <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !shown && "-rotate-90")} />
                </button>
                {/* The rule down the left is what makes a section read as a group
                    rather than a heading followed by unrelated rows. */}
                {shown ? (
                  <ul className="ml-[1.35rem] mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
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
  /* The same menu squeezed to icons: Search, Home, then every row of every
     section as its own icon, a thin rule between sections, the gold bar on the
     page you are on. Hover says what each one is. */
  const railIcon = "relative grid size-10 shrink-0 place-items-center rounded-xl transition-all";
  const railOn = "text-foreground before:absolute before:inset-y-2 before:-left-2 before:w-[3px] before:rounded-full before:bg-[#e3b341]";
  const railOff = "text-foreground/65 hover:bg-foreground/5 hover:text-foreground";
  const railLink = (item: { href: string; icon: string; label: string }) => (
    <Link
      key={item.href + item.label}
      href={item.href}
      title={tr(item.label)}
      aria-label={tr(item.label)}
      className={cn(railIcon, isActive(item.href) ? railOn : railOff)}
    >
      <Glyph name={item.icon} className="size-[18px]" />
    </Link>
  );
  const rail = (
    <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button type="button" onClick={focusSearch} title={`${tr("Search pages")}  (Ctrl K)`} aria-label={tr("Search pages")} className={cn(railIcon, railOff)}>
        <Search className="size-[18px]" />
      </button>
      <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-border/70" />
      {railLink(home)}
      {sections.map((section, i) => (
        <div key={section.label || `top-${i}`} className="flex flex-col items-center gap-1">
          <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-border/70" />
          {section.items.map((item) => railLink(item))}
        </div>
      ))}
    </nav>
  );

  return (
    <LocaleProvider locale={locale}>
    <ShellContext.Provider value={{ unread }}>
    <div
      className="flex min-h-dvh max-w-full touch-pan-x touch-pan-y overflow-x-clip bg-surface-2 print:max-w-none print:overflow-visible"
      style={{ backgroundImage: "radial-gradient(46rem 34rem at 0% 0%, hsl(var(--brand) / 0.10), transparent 70%), radial-gradient(40rem 30rem at 100% 100%, hsl(var(--brand) / 0.06), transparent 70%)" }}
    >
      {/* Desktop rail: a floating glass panel that can shrink to icons. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 p-3 transition-[width] duration-300 ease-out lg:block print:!hidden",
          collapsed ? "w-[5.5rem]" : "w-[15.5rem]"
        )}
      >
        <div className="relative flex h-full flex-col rounded-[28px] border border-border/60 bg-[radial-gradient(ellipse_at_15%_112%,rgba(234,150,45,0.18),transparent_60%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.82))] shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[radial-gradient(ellipse_at_15%_112%,rgba(234,150,45,0.28),transparent_60%),linear-gradient(180deg,#0b1736,#09122e)]">
          <button
            type="button"
            onClick={() => setRail(!collapsed)}
            aria-label={collapsed ? tr("Expand menu") : tr("Collapse menu")}
            title={collapsed ? tr("Expand menu") : tr("Collapse menu")}
            className="absolute -right-3 top-7 z-10 grid size-7 place-items-center rounded-full border border-border bg-background text-foreground shadow-md transition-transform hover:scale-110"
          >
            <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
          </button>
          <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center px-2" : "px-4")}>
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
        {/* On a phone the bar floats as a rounded card — menu, today's date, the
            bell — and nothing else; the rest is in the menu. On a computer it is
            the full-width bar it always was. */}
        <header className="sticky top-0 z-30 px-3 pb-1 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:hidden print:hidden">
          <div className="glass flex h-14 items-center gap-2 rounded-2xl border border-border/60 px-2 shadow-sm lg:h-16 lg:gap-3 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:px-8 lg:shadow-none">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label={tr("Open menu")}
            >
              <Menu />
            </Button>
            {pathname === home.href ? (
              <span className="min-w-0 truncate text-sm font-medium text-foreground/80 lg:hidden">{today}</span>
            ) : null}
            <div className="min-w-0 lg:hidden">
              <MobileBack />
            </div>
            <div className="ml-auto flex items-center gap-1 lg:gap-3">
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {tr(user.departmentLabel ?? user.roleLabel)}
              </span>

              {/* THE WAY OUT TO THE PUBLIC SITE, from every desk. An ordinary
                  in-tab link: same origin, so the session stays and coming back
                  lands on the desk they left. On a phone it is in the user menu. */}
              <Link
                href="/"
                title={tr("Open the public website — you stay signed in")}
                className="hidden h-9 items-center gap-1.5 rounded-full px-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:inline-flex"
              >
                <Globe className="size-[18px]" />
                <span>{tr("Main site")}</span>
              </Link>

              {/* THE BELL BELONGS WHERE PEOPLE LOOK FOR IT: the count is visible
                  from every screen, which is the only reason to keep a count. */}
              <Link
                href="/app/notifications"
                aria-label={unread > 0 ? `${tr("Notifications")}, ${unread}` : tr("Notifications")}
                className="relative grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:size-9"
              >
                <Bell className="size-[18px]" />
                {unread > 0 ? (
                  <span className="tnum absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-signal px-1 text-[10px] font-semibold leading-[18px] text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>

              <span className="hidden size-9 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground lg:grid">
                {initials(user.name)}
              </span>
            </div>
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
    </ShellContext.Provider>
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
  const [menu, setMenu] = useState(false);
  const { unread } = useShell();
  const tr = (text: string) => t(locale, text);
  const avatar = (
    <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
      {initials(user.name)}
      <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-500" />
    </span>
  );
  return (
    <div className="relative shrink-0 border-t border-border/50 p-2.5">
      {menu ? (
        <>
          <button type="button" aria-label={tr("Close menu")} className="fixed inset-0 z-40 cursor-default" onClick={() => setMenu(false)} />
          {/* Everything that is not a page lives here, so the menu itself stays
              a list of pages: your profile, the theme, the language, the way out. */}
          <div
            className={cn(
              "absolute z-50 w-60 rounded-2xl border border-border/70 bg-popover p-2 text-popover-foreground shadow-2xl",
              compact ? "bottom-2 left-full ml-3" : "bottom-full left-2.5 right-2.5 mb-2 w-auto"
            )}
          >
            <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">
              {user.name} · {tr(user.roleLabel)}
            </p>
            <Link href="/app/profile" onClick={() => setMenu(false)} className="flex items-center justify-between rounded-xl px-2 py-2 text-sm transition-colors hover:bg-foreground/5">
              {tr("Profile")}
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
            <Link href="/app/notifications" onClick={() => setMenu(false)} className="flex items-center justify-between rounded-xl px-2 py-2 text-sm transition-colors hover:bg-foreground/5">
              {tr("Notifications")}
              <span className="flex items-center gap-1.5">
                {unread > 0 ? <span className="tnum rounded-full bg-signal px-1.5 text-[10px] font-semibold leading-[18px] text-white">{unread > 99 ? "99+" : unread}</span> : null}
                <ChevronRight className="size-4 text-muted-foreground" />
              </span>
            </Link>
            <Link href="/" onClick={() => setMenu(false)} className="flex items-center justify-between rounded-xl px-2 py-2 text-sm transition-colors hover:bg-foreground/5">
              {tr("Main site")}
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
            <div className="flex items-center justify-between rounded-xl px-2 py-1 text-sm">
              {tr("Theme")}
              <ThemeToggle />
            </div>
            <LanguageSwitch current={locale} className="my-1 w-full [&>button]:flex-1 [&>button]:justify-center" />
            <form action={logout}>
              <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10">
                <LogOut className="size-4" />
                {tr("Sign out")}
              </button>
            </form>
          </div>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        title={user.name}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-foreground/5",
          compact && "justify-center px-0"
        )}
      >
        {avatar}
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.name}</span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !menu && "-rotate-90")} />
          </>
        )}
      </button>
    </div>
  );
}
