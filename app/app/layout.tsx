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
      {/* Working as somebody. On a computer: a small pill in the corner, out of
          the way. On a phone a floating pill sat on top of the page and the
          bottom bar, so there it is a slim bar at the top of the page, in the
          flow, that pushes the content down instead of covering it. Either way
          the one thing needed is Stop. */}
      {user.impersonatedBy ? (
        <>
          <div
            title={`Everything you do is recorded as ${user.impersonatedBy.name} (Developer)`}
            className="hidden lg:fixed lg:bottom-4 lg:right-4 lg:z-40 lg:flex lg:items-center lg:gap-2 lg:rounded-full lg:bg-warning lg:py-1 lg:pl-3 lg:pr-1 lg:text-xs lg:font-medium lg:text-white lg:shadow-lg"
          >
            <span>Working as {user.name}</span>
            <form action={stopWorkAs}>
              <button type="submit" className="rounded-full bg-white/25 px-2.5 py-1 font-semibold hover:bg-white/35">
                Stop
              </button>
            </form>
          </div>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-warning px-3 py-2 text-sm font-medium text-white lg:hidden">
            <span className="min-w-0 truncate">Working as {user.name}</span>
            <form action={stopWorkAs} className="shrink-0">
              <button type="submit" className="rounded-full bg-white/25 px-3 py-1 text-xs font-semibold">
                Stop
              </button>
            </form>
          </div>
        </>
      ) : null}
      {children}
    </AppShell>
  );
}
