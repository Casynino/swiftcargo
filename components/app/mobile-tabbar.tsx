"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Boxes,
  Headset,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PackageCheck,
  PackagePlus,
  Search,
  ShieldCheck,
  Ship,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";

import { useT } from "@/components/app/locale-provider";
import type { NavItem, NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The doors a desk keeps under its thumb, as on the air side.
 *
 * A phone opened from a WhatsApp or WeChat link often has no back button at
 * all, and a screen reached by pressing a button was a dead end: the only way
 * out was the hamburger, then finding the row. Home and the desk's own working
 * screens are always one press away from here, whatever page the reader is on.
 *
 * Four per desk and the fifth opens the whole menu. A fifth destination puts
 * every target under 60px on a 360px phone.
 */
type Tab = { href: string; icon: LucideIcon; exact?: boolean; label?: string };

const TABS: Partial<Record<Role, Tab[]>> = {
  ADMIN: [
    { href: "/app/dashboard", icon: LayoutDashboard, exact: true, label: "Home" },
    { href: "/app/search", icon: Search },
    { href: "/app/containers/loading", icon: Ship },
    { href: "/app/finance", icon: Wallet, label: "Finance" },
  ],
  MANAGER: [
    { href: "/app/manager", icon: LayoutDashboard, exact: true, label: "Home" },
    { href: "/app/search", icon: Search },
    { href: "/app/manager/control", icon: ShieldCheck, label: "Control" },
    { href: "/app/finance", icon: Wallet, label: "Finance" },
  ],
  /* Guangzhou receives and loads; it never checks cargo in or releases it. */
  CHINA_WAREHOUSE: [
    { href: "/app/dashboard", icon: LayoutDashboard, exact: true, label: "Home" },
    { href: "/app/search", icon: Search },
    { href: "/app/receive/new", icon: PackagePlus },
    { href: "/app/containers/loading", icon: Boxes },
  ],
  /* The Dar floor works a line: a box lands and is checked in, a customer
     arrives and it goes out. Those two screens are the shift. */
  DAR_WAREHOUSE: [
    { href: "/app/dashboard", icon: LayoutDashboard, exact: true, label: "Home" },
    { href: "/app/search", icon: Search },
    { href: "/app/receive/dar", icon: PackageCheck },
    { href: "/app/release", icon: Truck },
  ],
  FINANCE: [
    { href: "/app/dashboard", icon: LayoutDashboard, exact: true, label: "Home" },
    { href: "/app/search", icon: Search },
    { href: "/app/finance/collections", icon: Banknote },
    { href: "/app/finance", icon: Wallet, label: "Finance" },
  ],
  CUSTOMER_SUPPORT: [
    { href: "/app/support", icon: Headset, exact: true, label: "Home" },
    { href: "/app/search", icon: Search },
    { href: "/app/support/tickets", icon: MessageSquare },
    { href: "/app/finance/collections", icon: Banknote },
  ],
};

export function MobileTabbar({
  sections,
  home,
  role,
  onMore,
}: {
  /** The role's own menu, already filtered by permission. */
  sections: NavSection[];
  home: NavItem;
  role: Role;
  /** Opens the drawer the shell already has. */
  onMore: () => void;
}) {
  const pathname = usePathname() ?? "";
  const t = useT();

  /* Names and permissions both come from the role's menu: a tab whose row is
     not in it is a door this desk cannot open, and a second name for a page
     staff already call something is a misunderstanding a day. */
  const labels = new Map<string, string>([[home.href, "Home"]]);
  for (const section of sections) {
    for (const item of section.items) {
      if (!labels.has(item.href)) labels.set(item.href, item.label);
    }
  }

  const tabs = (TABS[role] ?? []).filter((tab) => labels.has(tab.href));
  if (tabs.length === 0) return null;

  /* Longest match wins across the bar, so /app/finance and
     /app/finance/collections are never lit together. */
  const activeHref = tabs
    .filter((tab) =>
      tab.exact
        ? pathname === tab.href
        : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    /* Hidden on paper too: a print page is narrower than lg, and a row of tabs
       on a cargo label is a reprint. Under the drawer's z-50. */
    <nav
      aria-label={t("Navigation")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
    >
      <div className="flex h-14 items-stretch">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.href === activeHref;
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
              {/* A mark and a weight as well as a colour: this bar is read in
                  sunlight on a warehouse floor. */}
              {active ? (
                <span aria-hidden className="absolute inset-x-2.5 top-0 h-0.5 rounded-full bg-brand" />
              ) : null}
              <Icon className="size-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
              <span className="line-clamp-2 px-0.5 text-center text-[10px] font-medium leading-[1.15]">
                {t(tab.label ?? labels.get(tab.href) ?? "")}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onMore}
          className="flex min-w-0 flex-1 flex-col items-center justify-start gap-0.5 pt-1.5 text-muted-foreground transition-colors active:bg-secondary"
        >
          <Menu className="size-5 shrink-0" />
          <span className="line-clamp-2 px-0.5 text-center text-[10px] font-medium leading-[1.15]">
            {t("Navigation")}
          </span>
        </button>
      </div>
    </nav>
  );
}
