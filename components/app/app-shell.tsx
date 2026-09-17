"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { Bell, ChevronRight, LogOut, Menu, X } from "lucide-react";

import { NavTrail } from "@/components/app/nav-trail";
import { RecordPaymentDialog } from "@/components/app/record-payment-dialog";
import { MobileBack } from "@/components/app/smart-back";
import { NavProvider } from "@/components/app/section-tabs";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { type NavItem, type NavSection } from "@/lib/nav";
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
  children,
}: {
  canRecordPayment?: boolean;
  canClearShortfall?: boolean;
  sections: NavSection[];
  /** Where this desk's Home row goes. */
  home: NavItem;
  user: { name: string; email: string; roleLabel: string; departmentLabel: string | null };
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
      <span className="truncate">{item.label}</span>
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
              {section.label}
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
    <div className="flex min-h-dvh bg-surface-2">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center border-b px-4">
          <Link href={home.href}>
            <BrandMark size={32} />
          </Link>
        </div>
        {nav}
        <UserFooter user={user} />
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-background shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <BrandMark size={32} />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                <X />
              </Button>
            </div>
            {nav}
            <UserFooter user={user} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
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
              {user.departmentLabel ?? user.roleLabel}
            </span>

            {/* THE BELL BELONGS WHERE PEOPLE LOOK FOR IT. Buried in the menu it
                was a row you scrolled past; up here the count is visible from
                every screen, which is the only reason to keep a count at all. */}
            <Link
              href="/app/notifications"
              aria-label={
                unread > 0
                  ? `Notifications, ${unread} unread`
                  : "Notifications"
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

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {/* Records where the reader walked, for every back control. */}
          <Suspense fallback={null}>
            <NavTrail />
          </Suspense>
          {/* A ceiling on the reading width. On a 2560 screen a table stretched
              edge to edge puts a name and its balance a head-turn apart. */}
          <div className="mx-auto w-full max-w-[1600px]">
            <NavProvider sections={sections}>{children}</NavProvider>
          </div>
        </main>
        {/* One dialog for the whole app, opened from any button or any link
            to #record-payment, over whatever screen the desk is on. */}
        {canRecordPayment ? <RecordPaymentDialog canClear={canClearShortfall} /> : null}
      </div>
    </div>
  );
}

function UserFooter({
  user,
}: {
  user: { name: string; email: string; roleLabel: string };
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
            {user.roleLabel}
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
            Sign out
          </Button>
        </form>
        <ThemeToggle />
      </div>
    </div>
  );
}
