import type { Role } from "@prisma/client";

import type { ActionPill } from "@/components/app/action-pills";

/**
 * The quick actions each desk reaches for.
 *
 * Kept beside the navigation rather than inside each dashboard so that a new
 * button appears in one place and is filtered by the same permission logic —
 * a pill that renders for a desk which cannot use its destination is a promise
 * the next screen breaks.
 */
export function pillsFor(role: Role): ActionPill[] {
  switch (role) {
    case "CHINA_WAREHOUSE":
      return [
        { label: "Receive cargo", href: "/app/receive/new", icon: "PackagePlus", tone: "success" },
        { label: "Open a container", href: "/app/containers/new", icon: "Container", tone: "marine" },
        { label: "Warehouse floor", href: "/app/inventory", icon: "Warehouse" },
        { label: "Raise an issue", href: "/app/exceptions", icon: "TriangleAlert", tone: "warning" },
      ];
    case "DAR_WAREHOUSE":
      return [
        { label: "Receive at Dar", href: "/app/receive/dar", icon: "PackageCheck", tone: "success" },
        { label: "Verify counts", href: "/app/receive/dar", icon: "ClipboardCheck", tone: "brand" },
        { label: "Hand cargo over", href: "/app/release", icon: "DoorOpen", tone: "marine" },
        { label: "Deliveries", href: "/app/deliveries", icon: "Truck" },
        { label: "Inventory", href: "/app/inventory", icon: "Warehouse" },
        { label: "Raise an issue", href: "/app/exceptions", icon: "TriangleAlert", tone: "warning" },
      ];
    case "FINANCE":
      return [
        { label: "Verify payments", href: "/app/finance/collections/verify", icon: "ShieldCheck", tone: "brand" },
        { label: "Record Payment", href: "#record-payment", icon: "Banknote", tone: "success" },
        { label: "Merge Payment", href: "/app/finance/payments/new", icon: "Layers", tone: "success" },
        { label: "Release on credit", href: "/app/finance/credit", icon: "CalendarClock" },
        { label: "Payment follow-up", href: "/app/finance/collections", icon: "Clock", tone: "warning" },
        { label: "Record a cost", href: "/app/finance/expenses", icon: "Wallet", tone: "danger" },
        { label: "Reconciliation", href: "/app/manager/reconciliation", icon: "Scale", tone: "signal" },
      ];
    case "CUSTOMER_SUPPORT":
      return [
        { label: "Collections", href: "/app/finance/collections", icon: "Banknote", tone: "signal" },
        { label: "Record Payment", href: "#record-payment", icon: "HandCoins", tone: "plain" },
        { label: "Merge Payment", href: "/app/finance/payments/new", icon: "Layers", tone: "success" },
        { label: "Arrived containers", href: "/app/containers/arrived", icon: "Ship", tone: "marine" },
        { label: "Pickup notes", href: "/app/finance/pickup-notes", icon: "QrCode", tone: "success" },
        { label: "Issues & claims", href: "/app/exceptions", icon: "TriangleAlert", tone: "warning" },
      ];
    case "MANAGER":
      /* Things this desk STARTS or DECIDES, from the one pressed every day to
         the one read once a week. The control room is not here: the attention
         panel under these carries it as its own link, and the same destination
         twice on one screen is clutter. */
      return [
        { label: "Pending approvals", href: "/app/manager/approvals", icon: "BadgeCheck", tone: "brand" },
        { label: "Reconciliation", href: "/app/manager/reconciliation", icon: "Scale", tone: "signal" },
        { label: "Payroll", href: "/app/finance/payroll", icon: "Wallet", tone: "success" },
        { label: "Issues & claims", href: "/app/exceptions", icon: "TriangleAlert", tone: "warning" },
        { label: "Management report", href: "/app/manager/reports", icon: "FileText", tone: "marine" },
      ];
    case "ADMIN":
      /* What the owner presses, not a second sidebar: money moving and money
         standing still first, then what is waiting on a decision, the two ends
         of a container's life, and the one register nobody else can read. The
         manager view is not here — this home IS that screen. */
      return [
        { label: "General ledger", href: "/app/finance/ledger", icon: "Landmark", tone: "signal" },
        { label: "Verify payments", href: "/app/finance/collections/verify", icon: "ShieldCheck", tone: "brand" },
        { label: "Issues & claims", href: "/app/exceptions", icon: "TriangleAlert", tone: "warning" },
        { label: "Arrived containers", href: "/app/containers/arrived", icon: "Ship", tone: "marine" },
        { label: "Loading containers", href: "/app/containers/loading", icon: "Boxes" },
        { label: "Deleted records", href: "/app/admin/deleted", icon: "Trash2", tone: "success" },
      ];
    default:
      return [];
  }
}

/** The one line under the greeting on each desk's banner. */
export function subtitleFor(role: Role): string {
  switch (role) {
    case "CHINA_WAREHOUSE":
      return "What is arriving, what is measured, and what is waiting for a container.";
    case "DAR_WAREHOUSE":
      return "What is landing, what needs checking, and what may go out today.";
    case "FINANCE":
      return "Here is the money, and what is waiting on you.";
    case "CUSTOMER_SUPPORT":
      return "Who is waiting on an answer, and who owes us money.";
    case "MANAGER":
      return "Here is the whole business, and what is waiting on you.";
    case "ADMIN":
      return "The whole operation, and the keys to it.";
    default:
      return "";
  }
}
