import { AppShell } from "@/components/app/app-shell";
import { DEPARTMENT_LABELS, ROLE_LABELS } from "@/lib/constants";
import { homeFor, navigationFor } from "@/lib/nav";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { stopWorkAs } from "@/lib/actions/developer";
import { requireStaff } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer-locale";

/**
 * The staff shell requires only a session and that it is not a customer's.
 *
 * It does NOT check a permission — each page behind it re-asserts its own with
 * `requirePermission`, and a layout that guessed at a permission for the whole
 * subtree would either be too wide to be a gate or too narrow to let anybody in.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireStaff();

  const [unread, locale] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    viewerLocale(),
  ]);

  return (
    <AppShell
      sections={navigationFor(user.role)}
      home={homeFor(user.role)}
      unread={unread}
      locale={locale}
      canRecordPayment={can(user.role, "payment.submit")}
      canClearShortfall={can(user.role, "payment.verify")}
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role],
        departmentLabel: user.department
          ? DEPARTMENT_LABELS[user.department]
          : null,
      }}
    >
      {/* Working as somebody: a small pill at the bottom, out of the way, with
          the one thing needed — Stop. On a phone it floats just above the
          bottom bar (not on it), and a spacer after the page leaves room so it
          never covers the last thing on the screen. */}
      {user.impersonatedBy ? (
        <div
          title={`Everything you do is recorded as ${user.impersonatedBy.name} (Developer)`}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full bg-warning py-1 pl-3 pr-1 text-xs font-medium text-white shadow-lg lg:bottom-4 lg:right-4"
        >
          <span className="min-w-0 truncate">Working as {user.name}</span>
          <form action={stopWorkAs} className="shrink-0">
            <button type="submit" className="rounded-full bg-white/25 px-3 py-1.5 font-semibold hover:bg-white/35">
              Stop
            </button>
          </form>
        </div>
      ) : null}
      {children}
      {user.impersonatedBy ? <div aria-hidden className="h-12 lg:hidden" /> : null}
    </AppShell>
  );
}
