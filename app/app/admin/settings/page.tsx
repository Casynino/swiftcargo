import type { Metadata } from "next";

import {
  CollectionAccounts,
  type CollectionAccountRow,
} from "@/components/app/collection-accounts";
import { CompanySettingsForm } from "@/components/app/company-settings-form";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { accountPositions } from "@/lib/accounts";
import { formatCurrency } from "@/lib/currency";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Company settings" };

/**
 * What every customer is told, in one place.
 *
 * The owner's alone. Everyone else reads these; one mistyped number sends
 * every customer's money nowhere until somebody notices, and one mistyped VAT
 * rate is on every bill raised after it.
 */
export default async function CompanySettingsPage() {
  await primeLocale();
  const user = await requirePermission("settings.manage");

  const [locale, company, positions] = await Promise.all([
    localeOf(user.id),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    accountPositions(),
  ]);

  /* Whether money has moved through an account decides which of its fields
     may still change. Counted once for the page rather than per row. */
  const collection = positions.filter((p) => p.kind !== "CASH");
  const ids = collection.map((p) => p.id);
  const [payments, expenses, out, into, counts, payroll, rows] = await Promise.all([
    prisma.payment.groupBy({ by: ["accountId"], where: { accountId: { in: ids } }, _count: true }),
    prisma.containerExpense.groupBy({ by: ["accountId"], where: { accountId: { in: ids } }, _count: true }),
    prisma.accountTransfer.groupBy({ by: ["fromAccountId"], where: { fromAccountId: { in: ids } }, _count: true }),
    prisma.accountTransfer.groupBy({ by: ["toAccountId"], where: { toAccountId: { in: ids } }, _count: true }),
    prisma.cashCount.groupBy({ by: ["accountId"], where: { accountId: { in: ids } }, _count: true }),
    prisma.payrollRun.groupBy({ by: ["accountId"], where: { accountId: { in: ids } }, _count: true }),
    prisma.bankAccount.findMany({ where: { id: { in: ids } }, select: { id: true, sortOrder: true } }),
  ]);
  const used = new Set<string>([
    ...payments.map((r) => r.accountId),
    ...expenses.map((r) => r.accountId),
    ...out.map((r) => r.fromAccountId),
    ...into.map((r) => r.toAccountId),
    ...counts.map((r) => r.accountId),
    ...payroll.map((r) => r.accountId),
  ].filter((id): id is string => Boolean(id)));
  const order = new Map(rows.map((r) => [r.id, r.sortOrder]));

  const accounts: CollectionAccountRow[] = collection
    .map((p) => ({
      id: p.id,
      bankName: p.bankName,
      accountName: p.accountName,
      accountNumber: p.accountNumber,
      branch: p.branch,
      kind: p.kind as "BANK" | "MOBILE_MONEY",
      currency: p.currency,
      sortOrder: order.get(p.id) ?? 0,
      active: p.active,
      used: used.has(p.id) || p.opening !== 0,
      balanceLabel: formatCurrency(p.balance, p.currency),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.bankName.localeCompare(b.bankName));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t(locale, "Company settings")}
        description={t(
          locale,
          "The accounts customers pay into, the offices they collect from, how they reach you, and the figures every bill is worked out with. Changed here, changed everywhere at once."
        )}
      />
      <SectionTabs />

      <p className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm text-muted-foreground">
        {t(
          locale,
          "These appear on invoices, PDFs, delivery notes, packing lists, WhatsApp messages and the public site at the same time. Bills already issued keep the VAT, the exchange rate and the accounts to pay into that they were issued with; contact details, and the accounts on drafts and on bills issued before accounts were kept, print as they stand on the day a bill is printed."
        )}
      </p>

      <CollectionAccounts accounts={accounts} locale={locale} />

      <CompanySettingsForm
        locale={locale}
        settings={{
          name: company?.name ?? "Swift Cargo",
          tagline: company?.tagline ?? "",
          chinaEntity: company?.chinaEntity ?? "",
          darEntity: company?.darEntity ?? "",
          tin: company?.tin ?? "",
          vrn: company?.vrn ?? "",
          phone: company?.phone ?? "",
          altPhone: company?.altPhone ?? "",
          whatsapp: company?.whatsapp ?? "",
          email: company?.email ?? "",
          chinaAddress: company?.chinaAddress ?? "",
          darAddress: company?.darAddress ?? "",
          darPostal: company?.darPostal ?? "",
          vatPercent: company?.vatPercent.toString() ?? "18",
          pricesIncludeVat: company?.pricesIncludeVat ?? true,
          freeStorageDays: company?.freeStorageDays ?? 7,
          storagePerDay: company?.storagePerDay.toString() ?? "0",
          invoiceTerms: company?.invoiceTerms ?? "",
        }}
      />
    </div>
  );
}
