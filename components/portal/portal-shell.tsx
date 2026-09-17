"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  FileText,
  LogOut,
  Menu,
  MessagesSquare,
  Package,
  User,
  X,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/portal", label: "My cargo", icon: Package },
  { href: "/portal/invoices", label: "Invoices", icon: FileText },
  { href: "/portal/messages", label: "Messages", icon: MessagesSquare },
  { href: "/portal/notifications", label: "Updates", icon: Bell },
  { href: "/portal/profile", label: "My details", icon: User },
];

export function PortalShell({
  name,
  unread,
  children,
}: {
  name: string;
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-surface-2">
      <header className="glass sticky top-0 z-40 border-b">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/portal" className="focus-ring shrink-0 rounded">
            <BrandMark size={32} />
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {LINKS.map((link) => {
              const active =
                link.href === "/portal"
                  ? pathname === "/portal"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "focus-ring inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand text-brand-foreground"
                      : "text-foreground/70 hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <link.icon className="size-4" />
                  {link.label}
                  {link.href === "/portal/notifications" && unread > 0 ? (
                    <span className="tnum rounded-full bg-signal px-1.5 text-[10px] font-semibold text-signal-foreground">
                      {unread}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {name}
            </span>
            <ThemeToggle />
            <form action={logout} className="hidden md:block">
              <Button type="submit" variant="ghost" size="sm">
                <LogOut />
                Sign out
              </Button>
            </form>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              {open ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        {open ? (
          <nav className="border-t bg-card md:hidden">
            <ul className="container grid gap-1 py-3">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-secondary"
                  >
                    <link.icon className="size-4" />
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <form action={logout}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary"
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </button>
                </form>
              </li>
            </ul>
          </nav>
        ) : null}
      </header>

      <main className="container flex-1 py-8">{children}</main>
    </div>
  );
}
