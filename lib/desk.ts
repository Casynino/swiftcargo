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
        { label: "Receive cargo", short: "Receiving", href: "/app/receive/new", icon: "PackagePlus", tone: "success" },
        { label: "Open a container", short: "Container", href: "/app/containers/new", icon: "Container", tone: "marine" },
        { label: "Warehouse floor", short: "Warehouse", href: "/app/inventory", icon: "Warehouse" },
        { label: "Raise an issue", short: "Issues", href: "/app/exceptions", icon: "TriangleAlert", tone: "warning" },
      ];
    case "DAR_WAREHOUSE":
      return [
        { label: "Verify counts", short: "Verify", href: "/app/receive/dar", icon: "ClipboardCheck", tone: "success" },
        { label: "Scan & release", short: "Scan", href: "/app/scan", icon: "ScanLine", tone: "marine" },
        { label: "Pickup list", short: "Pickup", href: "/app/release", icon: "DoorOpen" },
        { label: "Inventory", href: "/app/inventory", icon: "Warehouse" },
        { label: "Raise an issue", short: "Issues", href: "/app/exceptions", icon: "TriangleAlert", tone: "warning" },
      ];
    case "FINANCE":
      return [
        { label: "Verify payments", short: "Verify", href: "/app/finance/collections/verify", icon: "ShieldCheck", tone: "brand" },
        { label: "Record Payment", short: "Payment", href: "#record-payment", icon: "Banknote", tone: "success" },
        { label: "Merge Payment", short: "Merge", href: "/app/finance/payments/new", icon: "Layers", tone: "success" },
        { label: "Release on credit", short: "Credit", href: "/app/finance/credit", icon: "CalendarClock" },
        { label: "Payment follow-up", short: "Follow", href: "/app/finance/collections", icon: "Clock", tone: "warning" },
        { label: "Record a cost", short: "Cost", href: "/app/finance/expenses", icon: "Wallet", tone: "danger" },
        { label: "Reconciliation", short: "Reconcile", href: "/app/manager/reconciliation", icon: "Scale", tone: "signal" },
      ];
    case "CUSTOMER_SUPPORT":
      return [
        { label: "Collections", href: "/app/finance/collections", icon: "Banknote", tone: "signal" },
        { label: "Record Payment", short: "Payment", href: "#record-payment", icon: "HandCoins", tone: "plain" },
        { label: "Merge Payment", short: "Merge", href: "/app/finance/payments/new", icon: "Layers", tone: "success" },
        { label: "Arrived containers", short: "Arrived", href: "/app/containers/arrived", icon: "Ship", tone: "marine" },
        { label: "Pickup notes", short: "Notes", href: "/app/finance/pickup-notes", icon: "QrCode", tone: "success" },
        { label: "Issues & claims", short: "Issues", href: "/app/exceptions", icon: "TriangleAlert", tone: "warning" },
      ];
    case "MANAGER":
      /* Things this desk STARTS or DECIDES, from the one pressed every day to
         the one read once a week. The control room is not here: the attention
         panel under these carries it as its own link, and the same destination
         twice on one screen is clutter. */
      return [
        { label: "Pending approvals", short: "Approvals", href: "/app/manager/approvals", icon: "BadgeCheck", tone: "brand" },
        { label: "Reconciliation", short: "Reconcile", href: "/app/manager/reconciliation", icon: "Scale", tone: "signal" },
        { label: "Payroll approval", short: "Payroll", href: "/app/manager/payroll", icon: "Wallet", tone: "success" },
        { label: "Issues & claims", short: "Issues", href: "/app/exceptions", icon: "TriangleAlert", tone: "warning" },
        { label: "Management report", short: "Report", href: "/app/manager/reports", icon: "FileText", tone: "marine" },
      ];
    case "ADMIN":
      /* What the owner presses, not a second sidebar: money moving and money
         standing still first, then what is waiting on a decision, the two ends
         of a container's life, and the one register nobody else can read. The
         manager view is not here — this home IS that screen. */
      return [
        { label: "The ledger", short: "Ledger", href: "/app/finance/ledger", icon: "Landmark", tone: "signal" },
        { label: "Accounts", href: "/app/finance/accounts", icon: "Wallet", tone: "brand" },
        { label: "Profit & loss", short: "Profit", href: "/app/finance/reports", icon: "TrendingUp", tone: "success" },
        { label: "Approvals", href: "/app/manager/approvals", icon: "BadgeCheck", tone: "marine" },
        { label: "Issues & claims", short: "Issues", href: "/app/exceptions", icon: "TriangleAlert", tone: "warning" },
        { label: "Deleted records", short: "Deleted", href: "/app/admin/deleted", icon: "Trash2" },
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
