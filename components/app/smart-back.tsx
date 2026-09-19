"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { backLabel, labelForPath, previousFrom, readTrail, titleFor } from "@/lib/nav-trail";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
/**
 * Where back goes, and what it is called — one decision, so the word and the
 * destination cannot disagree.
 *
 * The trail first: the page the reader actually came from. The fallback — the
 * page's own parent — only when they walked nowhere, having opened it from a
 * notification, a scan or a WhatsApp link. Rendered from the fallback first and
 * corrected once the trail is read, so it is never missing on the server pass.
 */
export function useSmartBack(fallbackHref: string, fallbackLabel: string) {
  const pathname = usePathname();
  const [target, setTarget] = useState({ href: fallbackHref, label: fallbackLabel });

  useEffect(() => {
    const back = previousFrom(readTrail(), window.location.pathname);
    if (!back) {
      setTarget({ href: fallbackHref, label: fallbackLabel });
      return;
    }
    const named = labelForPath(back);
    setTarget({
      href: back,
      /* The fallback label belongs to the fallback href. A different record is
         "Back", never another record's name. */
      label: named ?? titleFor(back) ?? (back.split("?")[0] === fallbackHref ? fallbackLabel : "Back"),
    });
  }, [pathname, fallbackHref, fallbackLabel]);

  return target;
}

/** The page-header back link. Desktop; the phone bar carries its own. */
export function SmartBack({
  fallbackHref,
  fallbackLabel,
  className,
}: {
  fallbackHref: string;
  fallbackLabel: string;
  className?: string;
}) {
  const target = useSmartBack(fallbackHref, fallbackLabel);
  return (
    <Link
      href={target.href}
      className={cn(
        "-ml-1 hidden max-w-full items-center gap-1 rounded-md pl-1 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground lg:inline-flex print:hidden",
        className
      )}
    >
      <ChevronLeft className="size-4 shrink-0" />
      <span className="truncate"><Tx>{target.label}</Tx></span>
    </Link>
  );
}

/**
 * The parent a path climbs to when there is no trail, longest prefix first.
 * Always a page the reader's desk can open.
 */
const PARENTS: { prefix: string; parent: string; label: string }[] = [
  { prefix: "/app/finance/collections/", parent: "/app/finance/collections", label: "Payment follow-up" },
  { prefix: "/app/finance/invoices", parent: "/app/finance/collections", label: "Payment follow-up" },
  { prefix: "/app/finance/payments/new/", parent: "/app/finance/payments/new", label: "Merge Payment" },
  { prefix: "/app/finance/containers/", parent: "/app/finance/containers", label: "Container finances" },
  { prefix: "/app/finance/accounts/", parent: "/app/finance/accounts", label: "Accounts" },
  { prefix: "/app/finance/ledger/", parent: "/app/finance/ledger", label: "General ledger" },
  { prefix: "/app/finance/receipts/", parent: "/app/finance/receipts", label: "Receipts" },
  { prefix: "/app/finance/pickup-notes/", parent: "/app/finance/pickup-notes", label: "Pickup notes" },
  { prefix: "/app/finance/reports/", parent: "/app/finance/reports", label: "Profit & loss" },
  { prefix: "/app/finance", parent: "/app/finance", label: "Finance" },
  { prefix: "/app/containers/", parent: "/app/containers", label: "Shipments" },
  { prefix: "/app/cargo", parent: "/app/dashboard", label: "Home" },
  { prefix: "/app/customers/", parent: "/app/customers", label: "Customers" },
  { prefix: "/app/receive/dar/", parent: "/app/receive/dar", label: "Receiving dock" },
  { prefix: "/app/release/", parent: "/app/release", label: "Pickup list" },
  { prefix: "/app/support/sourcing/", parent: "/app/support/sourcing", label: "Sourcing requests" },
  { prefix: "/app/support/", parent: "/app/support/tickets", label: "Tickets" },
  { prefix: "/app/exceptions/", parent: "/app/exceptions", label: "Issues & claims" },
  { prefix: "/app/admin/users/", parent: "/app/admin/users", label: "Users" },
  { prefix: "/app/admin/", parent: "/app/dashboard", label: "Home" },
];

/** Tops of a desk — a back control there would name a place nobody came from. */
const ROOTS = new Set([
  "/app",
  "/app/dashboard",
  "/app/support",
  "/app/search",
  "/app/scan",
  /* Every tab on the phone's bottom bar: somebody who pressed a tab did not
     come from anywhere, and a back control there names a place they were not. */
  "/app/manager",
  "/app/manager/control",
  "/app/receive/new",
  "/app/containers/loading",
  "/app/receive/dar",
  "/app/release",
  "/app/finance",
  "/app/finance/collections",
  "/app/support/tickets",
  "/app/containers",
]);

/**
 * THE WAY BACK ON A PHONE.
 *
 * A browser opened from a WhatsApp link has no back history at all, so the app
 * carries its own control in the top bar: the page walked from, else the
 * page's parent section, else Home. Hidden at the top of a desk.
 */
export function MobileBack() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [walked, setWalked] = useState<{ href: string; label: string } | null>(null);

  useEffect(() => {
    const back = previousFrom(readTrail(), window.location.pathname);
    setWalked(back ? { href: back, label: backLabel(back) } : null);
  }, [pathname]);

  if (ROOTS.has(pathname)) return null;

  const match = PARENTS.find((p) => pathname.startsWith(p.prefix) && pathname !== p.parent);
  const dest = walked ?? (match ? { href: match.parent, label: match.label } : { href: "/app/dashboard", label: "Home" });

  return (
    <button
      type="button"
      onClick={() => router.push(dest.href)}
      className="-ml-1 inline-flex h-11 max-w-[10rem] items-center gap-0.5 rounded-md pl-1 pr-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:bg-secondary print:hidden"
    >
      <ChevronLeft className="size-5 shrink-0" />
      <span className="truncate">{t(dest.label)}</span>
    </button>
  );
}
