import { PortalShell } from "@/components/portal/portal-shell";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

/**
 * The customer shell.
 *
 * `requireCustomer` is the gate: it redirects anybody who is not a customer and
 * hands back the customerId that every query underneath is scoped by. No page in
 * this tree ever reads an id out of a URL.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCustomer();

  const [unread, customer] = await Promise.all([
    prisma.notification.count({ where: { customerId: user.customerId, readAt: null } }),
    prisma.customer.findUnique({ where: { id: user.customerId }, select: { code: true } }),
  ]);

  return (
    <PortalShell name={user.name} code={customer?.code ?? null} unread={unread}>
      {children}
    </PortalShell>
  );
}
