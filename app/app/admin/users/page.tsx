import type { Metadata } from "next";

import { NewUserForm } from "@/components/app/new-user-form";
import { PageHeader } from "@/components/app/page-header";
import { UserRow } from "@/components/app/user-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Staff" };

export default async function UsersPage() {
  await primeLocale();
  const actor = await requirePermission("user.manage");

  const [locale, users, warehouses] = await Promise.all([
    localeOf(actor.id),
    prisma.user.findMany({
      // Customers sign up on the website against their own Customer record and
      // are not staff; they are never listed or edited here.
      where: { role: { not: "CUSTOMER" } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        lastLoginAt: true,
        warehouse: { select: { name: true } },
      },
    }),
    prisma.warehouse.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true },
    }),
  ]);

  const actorIsOwner = actor.role === "ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "Staff")}
        description={t(
          locale,
          "Create accounts, move people between departments, and switch access off the moment someone leaves."
        )}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Name")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t(locale, "Role")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t(locale, "Last login")}
                </TableHead>
                <TableHead className="text-right">{t(locale, "Access")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={{
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    warehouseName: user.warehouse?.name ?? null,
                    role: user.role,
                    active: user.active,
                    lastLoginAt: user.lastLoginAt
                      ? user.lastLoginAt.toISOString()
                      : null,
                  }}
                  isSelf={user.id === actor.id}
                  actorIsOwner={actorIsOwner}
                  locale={locale}
                />
              ))}
              {users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t(locale, "No staff accounts yet.")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <NewUserForm
          warehouses={warehouses}
          actorIsOwner={actorIsOwner}
          locale={locale}
        />
      </div>
    </div>
  );
}
