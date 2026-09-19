"use client";

import { useT } from "@/components/app/locale-provider";

import { createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

const NavContext = createContext<NavSection[]>([]);

export function NavProvider({
  sections,
  children,
}: {
  sections: NavSection[];
  children: React.ReactNode;
}) {
  return <NavContext.Provider value={sections}>{children}</NavContext.Provider>;
}

/**
 * THE DEPARTMENT'S OWN TABS, READ OFF THE SIDEBAR.
 *
 * Every department shows its screens as a row of tabs under the page title,
 * the way Finance and Containers do. The row is the sidebar section this page
 * belongs to — already filtered to what this desk is allowed — so a tab can
 * never offer a screen the menu would not, and adding a screen to the menu
 * adds its tab without anybody remembering to.
 *
 * Only real addresses: an item that opens a dialog is a button, not a place.
 */
export function SectionTabs() {
  const t = useT();
  const sections = useContext(NavContext);
  const pathname = usePathname();

  const matches = (href: string) =>
    !href.startsWith("#") && (pathname === href || pathname.startsWith(`${href}/`));

  let best: { section: NavSection; href: string } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      if (matches(item.href) && (!best || item.href.length > best.href.length)) {
        best = { section, href: item.href };
      }
    }
  }
  if (!best) return null;

  const items = best.section.items.filter((i) => !i.href.startsWith("#"));
  if (items.length < 2) return null;

  return (
    /* One row a thumb swipes on a phone; the whole set wrapped where there is
       room. Twelve wrapped pills filled half a phone screen before the page
       under them started. */
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            item.href === best.href
              ? "border-brand bg-brand text-brand-foreground"
              : "bg-card text-foreground hover:bg-secondary"
          )}
        >
          {t(item.label)}
        </Link>
      ))}
    </div>
  );
}
