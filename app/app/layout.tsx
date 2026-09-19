import { AppShell } from "@/components/app/app-shell";
import { DEPARTMENT_LABELS, ROLE_LABELS } from "@/lib/constants";
import { homeFor, navigationFor } from "@/lib/nav";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
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
      {children}
    </AppShell>
  );
}
