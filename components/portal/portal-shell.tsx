"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Calculator,
  CalendarPlus,
  FileText,
  Files,
  Globe,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Package,
  QrCode,
  Ship,
  User,
  X,
  type LucideIcon,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { logout } from "@/lib/actions/auth";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: LucideIcon; exact?: boolean };

/* Grouped the way a customer thinks about it: my goods, my money, my account. */
const GROUPS: { title: string | null; links: NavLink[] }[] = [
  {
    title: null,
    links: [{ href: "/portal", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    title: "Cargo",
    links: [
      { href: "/portal/cargo", label: "My cargo", icon: Package },
      { href: "/portal/shipments", label: "Shipments", icon: Ship },
      { href: "/portal/book", label: "Book / request", icon: CalendarPlus },
      { href: "/portal/calculator", label: "Shipping calculator", icon: Calculator },
    ],
  },
  {
    title: "Money",
    links: [
      { href: "/portal/invoices", label: "Invoices", icon: FileText },
      { href: "/portal/payments", label: "Payments", icon: HandCoins },
      { href: "/portal/pickups", label: "Pickups", icon: QrCode },
      { href: "/portal/documents", label: "Documents", icon: Files },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/portal/notifications", label: "Notifications", icon: Bell },
      { href: "/portal/messages", label: "Support", icon: MessagesSquare },
      { href: "/portal/profile", label: "Profile", icon: User },
    ],
  },
];

/* The four a customer opens most, under the thumb on a phone. The fifth slot
   opens everything else. */
const TABS: NavLink[] = [
  { href: "/portal", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/portal/cargo", label: "My cargo", icon: Package },
  { href: "/portal/book", label: "Book", icon: CalendarPlus },
  { href: "/portal/invoices", label: "Invoices", icon: FileText },
];

function isActive(pathname: string, link: NavLink) {
  return link.exact
    ? pathname === link.href
    : pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function PortalShell({
  name,
  code,
  unread,
  children,
}: {
  name: string;
  /** The customer number, quoted on the phone to Support. */
  code: string | null;
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  /* A drawer left open over the page it just navigated to hides that page. */
  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group.title ?? "top"}>
          {group.title ? (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.title}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.links.map((link) => {
              const active = isActive(pathname, link);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "focus-ring flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand text-brand-foreground"
                        : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <link.icon className="size-4 shrink-0" />
                    <span className="flex-1">{link.label}</span>
                    {link.href === "/portal/notifications" && unread > 0 ? (
                      <span className="tnum rounded-full bg-signal px-1.5 text-[10px] font-semibold leading-[18px] text-white">
                        {unread}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const account = (
    <div className="flex items-center gap-3 border-t px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        {code ? <p className="tnum truncate text-xs text-muted-foreground">{code}</p> : null}
      </div>
      <form action={logout}>
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-surface-2">
      {/* The whole menu, always open, where there is room for it. */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <Link href="/portal" className="flex h-16 items-center border-b px-5">
          <BrandMark size={30} />
        </Link>
        <div className="flex-1 overflow-y-auto px-3 py-5">{nav}</div>
        {account}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-raised">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <BrandMark size={28} />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="grid size-10 place-items-center rounded-full hover:bg-secondary"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-5">{nav}</div>
            {account}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 lg:px-8 print:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="grid size-10 place-items-center rounded-full hover:bg-secondary lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/portal" className="lg:hidden">
            <BrandMark size={28} showWordmark={false} />
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Back to the public site without signing out: same origin, the
                session stays, and "My account" there brings them straight back. */}
            <Link
              href="/"
              title="Swift Cargo website — you stay signed in"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-2.5"
            >
              <Globe className="size-[18px]" />
              <span className="hidden sm:inline">Main site</span>
            </Link>
            <Link
              href="/portal/notifications"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
              className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Bell className="size-[18px]" />
              {unread > 0 ? (
                <span className="tnum absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-signal px-1 text-[10px] font-semibold leading-[18px] text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 [--bottom-bar:calc(3.5rem+env(safe-area-inset-bottom))] lg:px-8 lg:py-8 lg:[--bottom-bar:0px]">
          {children}
        </main>
        {/* The room the bottom bar stands in. */}
        <div aria-hidden className="h-[calc(3.5rem_+_env(safe-area-inset-bottom))] lg:hidden print:hidden" />
      </div>

      <nav
        aria-label="Portal"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
      >
        <div className="flex h-14 items-stretch">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col items-center justify-start gap-0.5 pt-1.5 transition-colors active:bg-secondary",
                  active ? "text-brand" : "text-muted-foreground"
                )}
              >
                {active ? (
                  <span aria-hidden className="absolute inset-x-2.5 top-0 h-0.5 rounded-full bg-brand" />
                ) : null}
                <tab.icon className="size-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-w-0 flex-1 flex-col items-center justify-start gap-0.5 pt-1.5 text-muted-foreground active:bg-secondary"
          >
            <Menu className="size-5 shrink-0" />
            <span className="text-[10px] font-medium leading-tight">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
