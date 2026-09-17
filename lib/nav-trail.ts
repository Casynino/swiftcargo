/**
 * WHERE THE READER WALKED, NOT WHAT THE RECORD BELONGS TO.
 *
 * A consignment belongs to a container, and a bill to a customer — but a clerk
 * who opened that consignment from the payment follow-up list did not come from
 * the container and does not want to go there. They want the call list they were
 * working down, with its filter and its search still set. Relationship is not
 * navigation, and a back link that names a fixed page sends people somewhere
 * they never were.
 *
 * So the app keeps its own stack of where the reader has actually been, per tab.
 * One component in the shell maintains it; every back control reads it.
 *
 * NOT BROWSER HISTORY. `router.back()` cannot tell a page somebody walked to
 * from one the app redirected through, counts a filter change as a step, and is
 * empty when the page was opened from a WhatsApp link.
 *
 * A LIST RESETS IT: opening a list is the start of a piece of work. Arriving
 * somewhere already on the stack truncates back to it, so walking back the way
 * you came does not grow it.
 */

const KEY = "sc.nav.trail";
const MAX = 8;

/** Pages you open a record FROM. One segment deeper is a record. */
const DETAIL_PARENTS = [
  "/app/cargo/",
  "/app/containers/",
  "/app/customers/",
  "/app/exceptions/",
  "/app/support/",
  "/app/support/sourcing/",
  "/app/receive/dar/",
  "/app/finance/invoices/",
  "/app/finance/containers/",
  "/app/finance/accounts/",
  "/app/finance/ledger/",
  "/app/finance/pickup-notes/",
  "/app/finance/receipts/",
  "/app/finance/payments/new/",
  "/app/admin/users/",
];

/** Segments that are screens of their own, not a record's id. */
const STATIC_LEAVES = new Set([
  "new",
  "verify",
  "sent-back",
  "arrived",
  "closed",
  "loading",
  "requests",
  "collected",
  "tickets",
  "sourcing",
  "markets",
  "with-finance",
]);

export function isDetailPath(path: string): boolean {
  const clean = path.split("?")[0];
  const parent = DETAIL_PARENTS.filter((prefix) => clean.startsWith(prefix)).sort(
    (a, b) => b.length - a.length
  )[0];
  if (!parent) return false;
  const rest = clean.slice(parent.length).split("/")[0];
  return rest.length > 0 && !STATIC_LEAVES.has(rest);
}

/** Forms that make a record and then open it. */
const CREATION_FORMS = new Set(["/app/customers/new", "/app/containers/new"]);

/** Only our own pages: a stored value becomes a link target. */
function isOurs(url: string): boolean {
  return (
    typeof url === "string" &&
    url.startsWith("/app/") &&
    !url.startsWith("/app//") &&
    !url.includes("\\") &&
    url.length < 512
  );
}

function samePage(a: string, b: string): boolean {
  return a.split("?")[0] === b.split("?")[0];
}

export function readTrail(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isOurs).slice(-MAX) : [];
  } catch {
    /* Private browsing or a blocked store: back falls back, it never throws. */
    return [];
  }
}

function write(trail: string[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX)));
  } catch {
    /* Same: a convenience that could not be saved is not an error. */
  }
}

/**
 * Record that the reader is now here:
 *   - already on the stack — they walked back, so truncate to it;
 *   - a list — a new piece of work, so the stack becomes just this;
 *   - a record — one step deeper, so push.
 */
export function visit(url: string): string[] {
  if (typeof window === "undefined" || !isOurs(url)) return [];
  const trail = readTrail();

  const at = trail.findIndex((entry) => samePage(entry, url));
  if (at >= 0) {
    const next = trail.slice(0, at + 1);
    next[at] = url;
    write(next);
    return next;
  }

  /* A creation form is not a place to go back to. Once it has made the record
     and moved on to it, "back" naming the empty form would only offer to make
     the same customer twice. */
  const walked = trail.filter((entry) => !CREATION_FORMS.has(entry.split("?")[0]));
  const next = isDetailPath(url) ? [...walked, url] : [url];
  write(next);
  return next;
}

/**
 * The page before this one, whether or not this one is recorded yet — the back
 * control and the recorder are two effects in one tree and either may run first.
 */
export function previousFrom(trail: string[], here: string): string | null {
  const at = trail.findIndex((entry) => samePage(entry, here));
  if (at >= 0) return at >= 1 ? trail[at - 1] : null;
  const last = trail.length > 0 ? trail[trail.length - 1] : null;
  return last && !samePage(last, here) ? last : null;
}

/** What every list page is called, longest prefix first. */
const NAMES: { prefix: string; label: string }[] = [
  { prefix: "/app/finance/collections/verify", label: "Verify payments" },
  { prefix: "/app/finance/collections/sent-back", label: "Sent back" },
  { prefix: "/app/finance/collections", label: "Payment follow-up" },
  { prefix: "/app/finance/payments/new", label: "Merge Payment" },
  { prefix: "/app/finance/containers", label: "Container finances" },
  { prefix: "/app/finance/pickup-notes", label: "Pickup notes" },
  { prefix: "/app/finance/invoices", label: "Invoices" },
  { prefix: "/app/finance/receipts", label: "Receipts" },
  { prefix: "/app/finance/expenses", label: "Expenses" },
  { prefix: "/app/finance/accounts", label: "Accounts" },
  { prefix: "/app/finance/credit", label: "Credit" },
  { prefix: "/app/finance/payroll", label: "Payroll" },
  { prefix: "/app/finance/reports", label: "Profit & loss" },
  { prefix: "/app/finance/ledger", label: "General ledger" },
  { prefix: "/app/finance/rates", label: "Rate book" },
  { prefix: "/app/finance/audit", label: "Money audit" },
  { prefix: "/app/finance", label: "Finance" },
  { prefix: "/app/containers/arrived", label: "Arrived containers" },
  { prefix: "/app/containers/closed", label: "Closed containers" },
  { prefix: "/app/containers/loading", label: "Loading containers" },
  { prefix: "/app/containers/new", label: "New container" },
  { prefix: "/app/containers", label: "Shipments" },
  { prefix: "/app/cargo", label: "All cargo" },
  { prefix: "/app/customers/new", label: "New customer" },
  { prefix: "/app/customers", label: "Customers" },
  { prefix: "/app/receive/dar", label: "Receiving dock" },
  { prefix: "/app/receive/new", label: "Receive cargo" },
  { prefix: "/app/release/collected", label: "Collected cargo" },
  { prefix: "/app/release", label: "Pickup list" },
  { prefix: "/app/inventory", label: "Warehouse floor" },
  { prefix: "/app/deliveries", label: "Deliveries" },
  { prefix: "/app/packing-lists", label: "Packing lists" },
  { prefix: "/app/support/requests", label: "Requests" },
  { prefix: "/app/support/tickets", label: "Tickets" },
  { prefix: "/app/support/sourcing", label: "Sourcing requests" },
  { prefix: "/app/support/markets", label: "China markets" },
  { prefix: "/app/support", label: "Support home" },
  { prefix: "/app/exceptions", label: "Issues & claims" },
  { prefix: "/app/manager/payroll", label: "Payroll" },
  { prefix: "/app/manager", label: "Manager" },
  { prefix: "/app/admin/users", label: "Users" },
  { prefix: "/app/admin/audit", label: "Audit log" },
  { prefix: "/app/admin/settings", label: "Settings" },
  { prefix: "/app/admin/warehouses", label: "Warehouses" },
  { prefix: "/app/admin/content", label: "Website content" },
  { prefix: "/app/admin", label: "Administration" },
  { prefix: "/app/reports", label: "Warehouse reports" },
  { prefix: "/app/notifications", label: "Notifications" },
  { prefix: "/app/profile", label: "Profile" },
  { prefix: "/app/search", label: "Search" },
  { prefix: "/app/scan", label: "Scan" },
  { prefix: "/app/dashboard", label: "Home" },
];

/**
 * The name of a LIST page, or null for a record — only the page being returned
 * to knows what a record is called, and a list prefix would otherwise name it
 * after the list it sits under.
 */
export function labelForPath(path: string): string | null {
  const clean = path.split("?")[0];
  if (isDetailPath(clean)) return null;
  return NAMES.find((row) => clean.startsWith(row.prefix))?.label ?? null;
}

const TITLES = "sc.nav.titles";

/**
 * What a page called itself, remembered by path — so going back to a record
 * says "SC0061" or "INV-2026-000016" instead of a bare "Back". Read from the
 * page's own title, which is the name it shows at the top.
 */
export function rememberTitle(path: string, title: string) {
  if (typeof window === "undefined" || !isOurs(path)) return;
  const name = title.trim();
  if (!name) return;
  try {
    const map = JSON.parse(window.sessionStorage.getItem(TITLES) ?? "{}") as Record<string, string>;
    map[path.split("?")[0]] = name.slice(0, 60);
    const keys = Object.keys(map);
    if (keys.length > 40) delete map[keys[0]];
    window.sessionStorage.setItem(TITLES, JSON.stringify(map));
  } catch {
    /* A name is a courtesy; without it the link says "Back". */
  }
}

export function titleFor(path: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const map = JSON.parse(window.sessionStorage.getItem(TITLES) ?? "{}") as Record<string, string>;
    return map[path.split("?")[0]] ?? null;
  } catch {
    return null;
  }
}

/** The best name for a page to go back to: a list's own name, else its title. */
export function backLabel(path: string): string {
  return labelForPath(path) ?? titleFor(path) ?? "Back";
}
