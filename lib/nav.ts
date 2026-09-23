import type { Role } from "@prisma/client";

import { can, canAny, type Permission } from "@/lib/rbac";

export type NavItem = {
  label: string;
  href: string;
  icon: string;
  /** Any one of these opens the item. */
  permissions: Permission[];
  /**
   * Desks that can open the page but do not want it in their menu. Not a
   * permission — the page stays reachable from every link that leads to it —
   * only a decision about what is worth a line in the sidebar.
   */
  hiddenFor?: Role[];
  /** Stays first in its section instead of taking its place by length. */
  pinned?: boolean;
};

export type NavSection = {
  label: string;
  /** A lucide name, shown beside the section heading. */
  icon: string;
  items: NavItem[];
};

/**
 * THE SIDEBAR IS A VIEW OF THE PERMISSIONS, NOT A SECOND SET OF RULES.
 *
 * Every item names the permission its destination is guarded by, and the
 * filtering below is the only place that decides what a person sees. It is a
 * courtesy, not a defence: the route table in rbac.ts and the page's own
 * `requirePermission` are what actually close the door, and a link that is
 * merely unrendered is reachable by typing the address.
 *
 * Keeping the two in one file means a new page cannot appear in the menu
 * without somebody having written down who it is for.
 */
const SECTIONS: NavSection[] = [
  {
    label: "Today",
    icon: "Sunrise",
    items: [
      /* THE SCANNER COMES BEFORE THE KEYBOARD. Somebody standing at the door
         with a box in their hands reaches for the scanner; typing a reference
         is what they do when the label will not read. First item, first
         section. */
      {
        label: "Scan",
        href: "/app/scan",
        icon: "ScanLine",
        permissions: ["cargo.scan"],
      },
      {
        label: "Search",
        href: "/app/search",
        icon: "Search",
        permissions: ["search.global"],
      },
      /* Notifications live in the top bar, on every screen, where the unread
         count is actually seen. A menu row you have to scroll to is not a
         notification. Home is not in a section either — see HOME below. */
    ],
  },
  {
    label: "Cargo",
    icon: "Package",
    items: [
      /*
        A WAREHOUSE HAS ONE LIST, AND IT IS ITS OWN FLOOR.

        Guangzhou had three ways to look at the same consignments — a company
        list, a receiving queue and the floor — which is three places to check
        and two of them out of date. The floor is the honest one for a clerk:
        everything they took in, still sitting there, whether or not it is in a
        container yet. The office keeps the company-wide list, because the
        office is the only desk whose question spans both ends of the route.
      */
      /* TAKING CARGO IN COMES BEFORE LOOKING AT WHAT IS ALREADY THERE. Each
         warehouse's intake screen leads — Guangzhou receives, Dar checks a
         container off — and the floor is what those two screens fill. */
      { label: "Receive cargo", href: "/app/receive/new", icon: "PackagePlus", permissions: ["receiving.china"] },
      { label: "Receiving dock", href: "/app/receive/dar", icon: "PackageCheck", permissions: ["receiving.dar"] },
      { label: "Warehouse floor", href: "/app/inventory", icon: "Warehouse", permissions: ["inventory.view"], hiddenFor: ["FINANCE"] },
      /* Finance reaches cargo through its containers and its bills, and asked
         for the flat list to come out of its menu. Dar reaches it through its
         containers too — the Containers section below has its own "Cargo in
         China", the door back to the other end of the route. */
      { label: "All cargo", href: "/app/cargo", icon: "Package", permissions: ["cargo.viewAll"], hiddenFor: ["FINANCE", "DAR_WAREHOUSE"] },
    ],
  },
  {
    label: "Shipping",
    icon: "Ship",
    items: [
      /*
        A CONTAINER AND ITS SAILING ARE ONE THING.

        There were two screens listing the same boxes — one for loading, one for
        the voyage — and a clerk had to know which half of a container's life
        they were asking about. It has one life: opened, filled, sealed, sent,
        landed. The packing list is its document and opens from it; neither gets
        a menu of its own.
      */
      /* `container.load` rather than `container.view`: Dar can open a container
         — they have to, it is what the goods came off, and the receiving dock
         links straight into one — but running sailings is Guangzhou's and the
         office's work. A menu entry for it on the Dar floor was a screen they
         had no reason to press. */
      { label: "Shipments", href: "/app/containers", icon: "Ship", permissions: ["container.load"] },
    ],
  },
  {
    label: "Release",
    icon: "DoorOpen",
    items: [
      { label: "Pickup list", href: "/app/release", icon: "Truck", permissions: ["release.execute"] },
      { label: "Collected cargo", href: "/app/release/collected", icon: "History", permissions: ["release.execute"] },
      { label: "Deliveries", href: "/app/deliveries", icon: "Truck", permissions: ["delivery.manage"] },
    ],
  },
  {
    label: "Finance",
    icon: "Wallet",
    items: [
      /*
        OVERVIEW FIRST, THEN SHORTEST LABEL TO LONGEST.

        Overview is pinned because that is where the office lands and what it
        comes back to; below it the list runs short to long, which is the
        owner's own request. Ties break alphabetically so the order is stable —
        without that rule two labels of equal length would swap places whenever
        anybody touched this file.
      */
      { label: "Overview", href: "/app/finance", icon: "Wallet", permissions: ["finance.view"], pinned: true },
      { label: "Credit", href: "/app/finance/credit", icon: "CalendarClock", permissions: ["accounting.view"] },
      { label: "Payroll", href: "/app/finance/payroll", icon: "Wallet", permissions: ["accounting.view"] },
      { label: "Accounts", href: "/app/finance/accounts", icon: "Landmark", permissions: ["accounting.view"] },
      { label: "Expenses", href: "/app/finance/expenses", icon: "Banknote", permissions: ["expense.view"] },
      { label: "Collections", href: "/app/finance/collections", icon: "HandCoins", permissions: ["finance.view"] },
      { label: "Pickup notes", href: "/app/finance/pickup-notes", icon: "QrCode", permissions: ["finance.view"] },
      { label: "Profit & loss", href: "/app/finance/reports", icon: "TrendingUp", permissions: ["profit.view"] },
      { label: "General ledger", href: "/app/finance/ledger", icon: "ArrowLeftRight", permissions: ["accounting.view"] },
      { label: "Reconciliation", href: "/app/manager/reconciliation", icon: "Scale", permissions: ["record.reconcile"] },
      { label: "Merge Payment", href: "/app/finance/payments/new", icon: "Layers", permissions: ["payment.submit"] },
      { label: "Record payment", href: "#record-payment", icon: "Banknote", permissions: ["payment.submit"] },
      { label: "Verify payments", href: "/app/finance/collections/verify", icon: "ShieldCheck", permissions: ["payment.verify"] },
      { label: "Rate book", href: "/app/finance/rates", icon: "Tags", permissions: ["rate.view"] },
    ],
  },
  {
    /*
      THE SAILINGS, AS MONEY.

      Its own group rather than a row inside Finance, because a container is the
      unit this business bills in: loaded together, landed together, and the
      customers on it are chased together. Target keeps its flights the same way.
    */
    label: "Containers",
    icon: "Container",
    items: [
      /* THE SAME LIST UNDER THE NAME THE OFFICE CALLS IT, AND IN THE PLACE IT
         BELONGS. A desk in Dar does not think of Guangzhou as "the floor" — it
         asks what is in China, and it asks that while looking at the boxes,
         because cargo standing in China is the next container's contents.
         `?floor=china` is Dar's own request for the other end of the route —
         see app/app/inventory/page.tsx — and a no-op for everyone else here,
         who gets Guangzhou by default already. China itself stays off this
         row: its own "Warehouse floor" already is this list. */
      { label: "Cargo in China", href: "/app/inventory?floor=china", icon: "Warehouse", permissions: ["inventory.view"], hiddenFor: ["CHINA_WAREHOUSE"] },
      { label: "Container finances", href: "/app/finance/containers", icon: "Container", permissions: ["finance.view"] },
      { label: "Closed containers", href: "/app/containers/closed", icon: "ClipboardCheck", permissions: ["accounting.view"] },
      { label: "Arrived containers", href: "/app/containers/arrived", icon: "Ship", permissions: ["container.view"] },
      { label: "Loading containers", href: "/app/containers/loading", icon: "Boxes", permissions: ["container.view"] },
    ],
  },
  {
    label: "Customers",
    icon: "Users",
    items: [
      { label: "Customers", href: "/app/customers", icon: "Users", permissions: ["customer.view"] },
      { label: "Inbox", href: "/app/support", icon: "MessagesSquare", permissions: ["conversation.view"] },
      { label: "Requests", href: "/app/support/requests", icon: "Inbox", permissions: ["request.view"] },
      { label: "Issues & claims", href: "/app/exceptions", icon: "TriangleAlert", permissions: ["exception.view"] },
    ],
  },
  {
    label: "Oversight",
    icon: "Gauge",
    items: [
      { label: "Manager", href: "/app/manager", icon: "Gauge", permissions: ["record.review"] },
      { label: "Warehouse reports", href: "/app/reports", icon: "ChartColumn", permissions: ["warehouse.reports"] },
    ],
  },
  {
    label: "Admin",
    icon: "Settings",
    items: [
      { label: "Users", href: "/app/admin/users", icon: "UserCog", permissions: ["user.manage"] },
      { label: "Warehouses", href: "/app/admin/warehouses", icon: "Building2", permissions: ["warehouse.manage"] },
      { label: "Website content", href: "/app/admin/content", icon: "Globe", permissions: ["content.manage"] },
      { label: "China markets", href: "/app/admin/markets", icon: "Store", permissions: ["content.manage"] },
      { label: "Audit log", href: "/app/admin/audit", icon: "ScrollText", permissions: ["audit.view"] },
      { label: "Settings", href: "/app/admin/settings", icon: "Settings", permissions: ["settings.manage"] },
    ],
  },
];

/**
 * HOME SITS ABOVE THE SECTIONS, NOT INSIDE ONE.
 *
 * Every desk lands here and every desk comes back to it, so it is one row at
 * the top rather than the first item of a group somebody has to read past. It
 * is called Home because that is what it is — "Dashboard" is what the people
 * who build software call it.
 */
export const HOME: NavItem = {
  label: "Home",
  href: "/app/dashboard",
  icon: "LayoutDashboard",
  permissions: ["cargo.view", "accounting.view", "conversation.view", "record.review"],
};

/**
 * THE SUPPORT DESK'S OWN MENU.
 *
 * Support works the telephone: find the cargo, find the customer, chase the
 * bill, answer the ticket, help them buy in China. The shared menu gave this
 * desk the warehouse's receiving screens and Finance's overview; its own list
 * carries what the desk does and nothing it cannot use. Same flow as the air
 * cargo desk, with containers where that one has batches.
 */
const SUPPORT_SECTIONS: NavSection[] = [
  {
    label: "",
    icon: "",
    items: [
      { label: "Search", href: "/app/search", icon: "Search", permissions: ["search.global"] },
      { label: "Customers", href: "/app/customers", icon: "Users", permissions: ["customer.view"] },
    ],
  },
  {
    label: "Containers",
    icon: "Container",
    items: [
      /* Before a box exists there is cargo standing in Guangzhou, and the desk
         answering the phone is asked about it first. */
      { label: "Cargo in China", href: "/app/inventory", icon: "Warehouse", permissions: ["inventory.view"] },
      { label: "Loading containers", href: "/app/containers/loading", icon: "Boxes", permissions: ["container.view"] },
      { label: "Arrived containers", href: "/app/containers/arrived", icon: "Ship", permissions: ["container.view"] },
    ],
  },
  {
    label: "Billing",
    icon: "ReceiptText",
    items: [
      { label: "Credit", href: "/app/finance/credit", icon: "CalendarClock", permissions: ["finance.view"] },
      { label: "Collections", href: "/app/finance/collections", icon: "HandCoins", permissions: ["finance.view"] },
      { label: "Pickup notes", href: "/app/finance/pickup-notes", icon: "QrCode", permissions: ["finance.view"] },
      { label: "Merge Payment", href: "/app/finance/payments/new", icon: "Layers", permissions: ["payment.submit"] },
      { label: "Record Payment", href: "#record-payment", icon: "Banknote", permissions: ["payment.submit"] },
      { label: "Rate book", href: "/app/finance/rates", icon: "Tags", permissions: ["rate.view"] },
    ],
  },
  {
    label: "Customer support",
    icon: "MessageSquare",
    items: [
      { label: "Tickets", href: "/app/support/tickets", icon: "MessageSquare", permissions: ["conversation.view"] },
      { label: "Requests", href: "/app/support/requests", icon: "Inbox", permissions: ["request.view"] },
      { label: "Issues & claims", href: "/app/exceptions", icon: "TriangleAlert", permissions: ["exception.view"] },
    ],
  },
  {
    label: "China services",
    icon: "Store",
    items: [
      { label: "China markets", href: "/app/support/markets", icon: "Store", permissions: ["conversation.view"] },
      { label: "Sourcing requests", href: "/app/support/sourcing", icon: "ShoppingBag", permissions: ["conversation.view"] },
    ],
  },
];

/**
 * THE MANAGER'S MENU.
 *
 * The person who runs the business works by question, not by department:
 * where the cargo and the containers are, what the money is doing, what is
 * leaving, what is waiting on a decision, who is working, and whether the books
 * can be trusted. Same shape as the air cargo command centre, with containers
 * where that one has flights.
 */
const MANAGER_SECTIONS: NavSection[] = [
  {
    label: "Operations",
    icon: "Boxes",
    items: [
      { label: "Search", href: "/app/search", icon: "Search", permissions: ["search.global"] },
      { label: "Customers", href: "/app/customers", icon: "Users", permissions: ["customer.view"] },
      { label: "Cargo in China", href: "/app/inventory", icon: "Warehouse", permissions: ["inventory.view"] },
      { label: "Container finances", href: "/app/finance/containers", icon: "Container", permissions: ["finance.view"] },
      { label: "Closed containers", href: "/app/containers/closed", icon: "PackageCheck", permissions: ["accounting.view"] },
      { label: "Arrived containers", href: "/app/containers/arrived", icon: "Ship", permissions: ["container.view"] },
      { label: "Loading containers", href: "/app/containers/loading", icon: "Boxes", permissions: ["container.view"] },
    ],
  },
  {
    label: "Finance",
    icon: "ReceiptText",
    items: [
      { label: "Overview", href: "/app/finance", icon: "LayoutGrid", permissions: ["accounting.view"], pinned: true },
      { label: "Collections", href: "/app/finance/collections", icon: "HandCoins", permissions: ["finance.view"] },
      { label: "Profit & loss", href: "/app/finance/reports", icon: "TrendingUp", permissions: ["profit.view"] },
      { label: "Reconciliation", href: "/app/manager/reconciliation", icon: "Scale", permissions: ["record.reconcile"] },
      { label: "General ledger", href: "/app/finance/ledger", icon: "ArrowLeftRight", permissions: ["accounting.view"] },
      { label: "Record Payment", href: "#record-payment", icon: "Banknote", permissions: ["payment.submit"] },
    ],
  },
  {
    label: "Money out",
    icon: "Wallet",
    items: [
      { label: "Credit", href: "/app/finance/credit", icon: "CalendarClock", permissions: ["finance.view"] },
      { label: "Expenses", href: "/app/finance/expenses", icon: "Banknote", permissions: ["expense.view"] },
      { label: "Accounts", href: "/app/finance/accounts", icon: "Landmark", permissions: ["accounting.view"] },
    ],
  },
  {
    label: "Decisions",
    icon: "ClipboardCheck",
    items: [
      { label: "Payroll", href: "/app/manager/payroll", icon: "Wallet", permissions: ["payroll.approve"] },
      { label: "Approvals", href: "/app/manager/approvals", icon: "ClipboardCheck", permissions: ["record.review"] },
      { label: "Control room", href: "/app/manager/control", icon: "Gauge", permissions: ["record.review"] },
    ],
  },
  {
    label: "People",
    icon: "Users",
    items: [
      { label: "Staff", href: "/app/admin/users", icon: "UserCog", permissions: ["user.manage"] },
      { label: "Tickets", href: "/app/support/tickets", icon: "MessageSquare", permissions: ["conversation.view"] },
      { label: "Issues & Claims", href: "/app/exceptions", icon: "TriangleAlert", permissions: ["exception.view"] },
    ],
  },
  {
    label: "Oversight",
    icon: "Eye",
    items: [
      { label: "Money audit", href: "/app/finance/audit", icon: "ShieldCheck", permissions: ["accounting.view"] },
      { label: "Deleted records", href: "/app/admin/deleted", icon: "Trash2", permissions: ["records.viewDeleted"] },
      { label: "Management report", href: "/app/manager/reports", icon: "FileText", permissions: ["record.review"] },
    ],
  },
];

/**
 * THE OWNER'S MENU.
 *
 * Grouped the way the business is: the work in the order cargo moves — taken
 * in, loaded, landed, billed — then the desks that answer for it, then the
 * business itself, then the keys to the building. The two logs sit last and
 * without a heading, because the record is where an argument is settled, not
 * a kind of work. Same shape as the air cargo owner's menu, with containers
 * where that one has batches.
 *
 * The owner holds every permission, so nothing here is filtered away for this
 * desk; each row still names its gate, because the menu is a view of the
 * permissions and never a second set of them.
 */
const ADMIN_SECTIONS: NavSection[] = [
  {
    label: "Cargo operations",
    icon: "Boxes",
    items: [
      { label: "Search", href: "/app/search", icon: "Search", permissions: ["search.global"] },
      { label: "Requests", href: "/app/support/requests", icon: "Inbox", permissions: ["request.view"] },
      { label: "Receive cargo", href: "/app/receive/new", icon: "PackagePlus", permissions: ["receiving.china"] },
      { label: "Receiving dock", href: "/app/receive/dar", icon: "ClipboardCheck", permissions: ["receiving.dar"] },
      { label: "Cargo in China", href: "/app/inventory", icon: "Warehouse", permissions: ["inventory.view"] },
    ],
  },
  {
    label: "Containers",
    icon: "Ship",
    items: [
      { label: "Scan & release", href: "/app/scan", icon: "ScanLine", permissions: ["cargo.scan"] },
      { label: "Loading containers", href: "/app/containers/loading", icon: "Boxes", permissions: ["container.view"] },
      { label: "Arrived containers", href: "/app/containers/arrived", icon: "Ship", permissions: ["container.view"] },
    ],
  },
  {
    label: "Finance",
    icon: "ReceiptText",
    items: [
      { label: "Overview", href: "/app/finance", icon: "Wallet", permissions: ["accounting.view"], pinned: true },
      { label: "Record Payment", href: "#record-payment", icon: "Banknote", permissions: ["payment.submit"] },
      { label: "Credit", href: "/app/finance/credit", icon: "CalendarClock", permissions: ["finance.view"] },
      { label: "Rate book", href: "/app/finance/rates", icon: "Tags", permissions: ["rate.view"] },
      { label: "Pickup notes", href: "/app/finance/pickup-notes", icon: "QrCode", permissions: ["finance.view"] },
      { label: "Accounts", href: "/app/finance/accounts", icon: "Landmark", permissions: ["accounting.view"] },
      { label: "General ledger", href: "/app/finance/ledger", icon: "ArrowLeftRight", permissions: ["accounting.view"] },
      { label: "Reconciliation", href: "/app/manager/reconciliation", icon: "Scale", permissions: ["record.reconcile"] },
      { label: "Expenses", href: "/app/finance/expenses", icon: "Receipt", permissions: ["expense.view"] },
      { label: "Payroll", href: "/app/finance/payroll", icon: "Wallet", permissions: ["payroll.prepare"] },
      { label: "Closed containers", href: "/app/containers/closed", icon: "PackageCheck", permissions: ["accounting.view"] },
      { label: "Profit & loss", href: "/app/finance/reports", icon: "TrendingUp", permissions: ["profit.view"] },
      { label: "Collections", href: "/app/finance/collections", icon: "PhoneCall", permissions: ["finance.view"] },
    ],
  },
  {
    label: "Support and issues",
    icon: "MessageSquare",
    items: [
      { label: "Tickets", href: "/app/support/tickets", icon: "MessageSquare", permissions: ["conversation.view"] },
      /* "Support home", not "Home" — this menu already has one, and a bare Home
         here would read as the owner's own dashboard. */
      { label: "Support home", href: "/app/support", icon: "Headset", permissions: ["conversation.view"] },
      { label: "Issues & Claims", href: "/app/exceptions", icon: "TriangleAlert", permissions: ["exception.view"] },
    ],
  },
  {
    label: "Customers",
    icon: "Users",
    items: [
      { label: "Customers", href: "/app/customers", icon: "Users", permissions: ["customer.view"] },
    ],
  },
  {
    label: "Business",
    icon: "Store",
    items: [
      /* The editor, not the support desk's read view: this is the menu of the
         person who changes what customers are told. */
      { label: "China markets", href: "/app/admin/markets", icon: "Store", permissions: ["content.manage"] },
      { label: "Sourcing requests", href: "/app/support/sourcing", icon: "ShoppingBag", permissions: ["conversation.view"] },
      { label: "Website content", href: "/app/admin/content", icon: "Globe", permissions: ["content.manage"] },
    ],
  },
  {
    label: "Administration",
    icon: "SlidersHorizontal",
    items: [
      { label: "Staff", href: "/app/admin/users", icon: "UserCog", permissions: ["user.manage"] },
      { label: "Deleted records", href: "/app/admin/deleted", icon: "Trash2", permissions: ["records.viewDeleted"] },
      { label: "Company settings", href: "/app/admin/settings", icon: "SlidersHorizontal", permissions: ["settings.manage"] },
      /* Both ends of the route, and the address a customer forwards to their
         supplier. Sea freight has two warehouses the owner configures; the air
         desk had none to set. */
      { label: "Warehouses", href: "/app/admin/warehouses", icon: "Building2", permissions: ["warehouse.manage"] },
    ],
  },
  {
    /* No heading, same as the air desk: the logs are where an argument is
       settled, not a kind of work. Every money action, and beside it every
       privileged action. */
    label: "",
    icon: "",
    items: [
      { label: "Money audit", href: "/app/finance/audit", icon: "History", permissions: ["accounting.view"] },
      { label: "Audit log", href: "/app/admin/audit", icon: "History", permissions: ["audit.view"] },
    ],
  },
];

const ROLE_SECTIONS: Partial<Record<Role, NavSection[]>> = {
  CUSTOMER_SUPPORT: SUPPORT_SECTIONS,
  MANAGER: MANAGER_SECTIONS,
  ADMIN: ADMIN_SECTIONS,
};

/** Where Home takes this desk. Support's home is the support desk itself. */
export function homeFor(role: Role | null | undefined): NavItem {
  if (role === "CUSTOMER_SUPPORT") {
    return { ...HOME, href: "/app/support", icon: "Headset" };
  }
  if (role === "MANAGER") {
    return { ...HOME, href: "/app/manager", icon: "LayoutDashboard" };
  }
  return HOME;
}

/** The menu this role actually gets. Empty sections are dropped, not shown bare. */
/**
 * HOW LONG A LABEL LOOKS, NOT HOW MANY LETTERS IT HAS.
 *
 * The owner reads "shortest to longest" with their eyes. "Profit & loss" and
 * "Merge Payment" are both thirteen characters, but an i, an l and an & are
 * narrow and an M and an m are wide, so counting letters put the visibly longer
 * one first. These are the sidebar font's advance widths (per thousand em);
 * anything not listed counts as an average letter.
 */
const ADVANCE: Record<string, number> = {
  " ": 280, "&": 680,
  a: 560, b: 620, c: 560, d: 620, e: 580, f: 360, g: 620, h: 600, i: 250, j: 250,
  k: 540, l: 250, m: 900, n: 600, o: 610, p: 620, q: 620, r: 380, s: 520, t: 370,
  u: 600, v: 540, w: 800, x: 530, y: 540, z: 520,
  A: 680, B: 650, C: 710, D: 720, E: 590, F: 560, G: 740, H: 740, I: 280, J: 520,
  K: 660, L: 540, M: 880, N: 740, O: 760, P: 630, Q: 760, R: 650, S: 620, T: 630,
  U: 730, V: 680, W: 980, X: 670, Y: 650, Z: 620,
};
function shownWidth(label: string) {
  return [...label].reduce((w, ch) => w + (ADVANCE[ch] ?? 580), 0);
}

export function navigationFor(role: Role | null | undefined): NavSection[] {
  return ((role && ROLE_SECTIONS[role]) || SECTIONS).map((section) => ({
    ...section,
    /* SHORTEST LABEL TO LONGEST, IN EVERY SECTION — the owner's order.
       Sorted here rather than typed in order, because a hand-kept order is the
       one that comes undone the next time somebody adds a screen. A pinned item
       (Finance's Overview) keeps the top; ties read alphabetically so the order
       never shuffles. */
    items: section.items
      .filter(
        (item) =>
          canAny(role, item.permissions) &&
          !(role && item.hiddenFor?.includes(role))
      )
      .sort(
        (a, b) =>
          Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
          shownWidth(a.label) - shownWidth(b.label) ||
          a.label.localeCompare(b.label)
      ),
  })).filter((section) => section.items.length > 0);
}

export { can };
