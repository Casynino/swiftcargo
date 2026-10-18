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
      {/* ALWAYS SAID: this is the developer, working as somebody, and what they
          do is recorded as the developer. One press ends it. */}
      {user.impersonatedBy ? (
        <div className="sticky top-0 z-30 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning px-4 py-2 text-xs font-medium text-white shadow-sm">
          <span>
            Working as {user.name} ({ROLE_LABELS[user.role]}) — everything you do is recorded as{" "}
            {user.impersonatedBy.name} (Developer)
          </span>
          <form action={stopWorkAs}>
            <button type="submit" className="rounded-full bg-white/20 px-3 py-1 font-semibold hover:bg-white/30">
              Stop
            </button>
          </form>
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
