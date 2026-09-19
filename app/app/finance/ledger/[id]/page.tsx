import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { History, Paperclip } from "lucide-react";

import { LedgerRowFix } from "@/components/app/ledger-row-fix";
import { PageHeader } from "@/components/app/page-header";
import { formatCurrency, formatRate } from "@/lib/currency";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { ledgerRows, methodLabel } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Ledger entry" };

type Fact = { label: string; value: React.ReactNode };

const dash = "—";
const when = (d: Date | null | undefined) => (d ? formatDateTime(d) : dash);
const link = (href: string, text: string, mono = false) => (
  <Link href={href} className={mono ? "font-mono text-xs hover:text-brand" : "hover:text-brand"}>
    {text}
  </Link>
);

/**
 * ONE MOVEMENT OF MONEY, WITH EVERYTHING RECORDED ABOUT IT.
 *
 * The register shows a line; this shows the record behind it — every field the
 * payment, cost, transfer or opening balance carries, the files that prove it,
 * and every change and correction made to it since, oldest first. Nothing here
 * is summarised away: somebody who opens a movement is usually asking a
 * question the line could not answer.
 */
export default async function LedgerEntryPage({ params }: { params: Promise<{ id: string }> }) {
  await primeLocale();
  const user = await requirePermission("accounting.view");
  const locale = await localeOf(user.id);
  const { id } = await params;

  const rows = await ledgerRows(locale);
  const recordId = id.replace(/^(pt|p|e|t-out|t-in|o)-/, "");
  /* A combined payment is one line named after its first slice; any slice's
     address opens that same line. */
  const row =
    rows.find((r) => r.id === id) ??
    rows.find(
      (r) =>
        r.fix?.kind === "payment" &&
        r.fix.paymentIds.includes(recordId) &&
        r.transport === id.startsWith("pt-")
    );
  if (!row) notFound();

  const mayVerify = can(user.role, "payment.verify");
  const mayCost = can(user.role, "expense.record");
  const mayMove = can(user.role, "accounting.manage");
  const mayOpenCustomer = can(user.role, "customer.view");
  const mayOpenCargo = can(user.role, "cargo.view");

  const inbound = row.direction === "IN";
  const facts: Fact[] = [
    { label: "Type", value: row.type },
    { label: "Account", value: link(`/app/finance/accounts/${row.accountId}`, row.account) },
    { label: "When the money moved", value: when(row.at) },
  ];
  const sections: { title: string; facts: Fact[] }[] = [];
  const files: { url: string; name: string }[] = [];
  const historyKeys: { entity: string; entityId: string }[] = [];
  /* Audit lines that name the record without being filed against it: a
     combined payment is logged against the customer, a write-off against the
     bill, a transfer against the account it left. */
  const auditExtra: Prisma.AuditLogWhereInput[] = [];

  if (row.fix?.kind === "payment") {
    const payments = await prisma.payment.findMany({
      where: { id: { in: row.fix.paymentIds } },
      orderBy: { reference: "asc" },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, code: true } },
        invoice: {
          select: {
            id: true,
            number: true,
            currency: true,
            total: true,
            totalTzs: true,
            cargo: { select: { id: true, reference: true, description: true } },
          },
        },
        receipts: { select: { id: true, number: true, amount: true, currency: true, issuedAt: true } },
        recordedBy: { select: { name: true } },
        verifiedBy: { select: { name: true } },
        proofs: { orderBy: { uploadedAt: "asc" } },
        account: { select: { bankName: true, currency: true } },
      },
    });
    const writeOffs = await prisma.payment.findMany({
      where: { writeOffOfId: { in: row.fix.paymentIds } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        reference: true,
        amount: true,
        currency: true,
        status: true,
        writeOffOfId: true,
        notes: true,
        reversedReason: true,
      },
    });

    const first = payments[0];
    if (first) {
      facts.push(
        {
          label: "Customer",
          value: mayOpenCustomer
            ? link(`/app/customers/${first.customer.id}`, first.customer.fullName)
            : first.customer.fullName,
        },
        { label: "Customer number", value: `${first.customer.code} · ${first.customer.phone}` },
        { label: "How it was paid", value: t(locale, methodLabel(first.method)) },
        { label: "Transaction reference", value: first.transactionRef ?? dash },
        { label: "Paid by", value: first.payerName ?? dash },
        { label: "Payer's bank / account", value: [first.payerBank, first.payerAccount].filter(Boolean).join(" · ") || dash },
        {
          label: "Submitted by",
          value: first.recordedBy?.name ?? (first.submittedByCustomer ? t(locale, "The customer, from the portal") : dash),
        },
        { label: "Recorded", value: when(first.createdAt) },
        { label: "Verified by", value: first.verifiedBy?.name ?? dash },
        { label: "Verified", value: when(first.verifiedAt) },
        { label: "Status", value: first.status },
      );
      if (first.reversedAt) {
        facts.push(
          { label: "Reversed", value: when(first.reversedAt) },
          { label: "Why it was reversed", value: first.reversedReason ?? dash }
        );
      }
      if (first.deliveryAdded && Number(first.deliveryAdded) > 0) {
        facts.push(
          { label: "Transport inside the payment", value: formatCurrency(first.deliveryAdded, first.currency) },
          { label: "Transport settled from", value: first.deliverySettledFrom ?? t(locale, "Not paid out yet") }
        );
      }
    }

    for (const p of payments) {
      historyKeys.push({ entity: "Payment", entityId: p.id });
      auditExtra.push(
        { action: { startsWith: "payment.record" }, metadata: { path: ["payments"], array_contains: [p.reference] } },
        { action: "payment.writeoff", metadata: { path: ["paymentId"], equals: p.id } }
      );
      for (const proof of p.proofs) files.push({ url: proof.url, name: proof.name ?? `${p.reference} proof` });
      const offs = writeOffs.filter((w) => w.writeOffOfId === p.id);
      sections.push({
        title: `${p.reference}${payments.length > 1 ? ` · ${p.invoice.cargo.reference}` : ""}`,
        facts: [
          { label: "Amount", value: formatCurrency(p.amount, p.currency) },
          {
            label: "Worth in shillings",
            value: p.baseCurrencyAmount ? formatCurrency(p.baseCurrencyAmount, "TZS") : dash,
          },
          { label: "Rate taken at", value: p.fxRate ? formatRate(p.fxRate) : dash },
          {
            label: "Credited to the bill",
            value: p.creditedAmount ? formatCurrency(p.creditedAmount, p.invoice.currency) : dash,
          },
          {
            label: "Receipt",
            value: p.receipts[0]
              ? link(`/app/finance/receipts/${p.receipts[0].id}`, p.receipts[0].number, true)
              : dash,
          },
          { label: "Invoice", value: link(`/app/finance/invoices/${p.invoice.id}`, p.invoice.number, true) },
          {
            label: "Bill total",
            value: `${formatCurrency(p.invoice.total, p.invoice.currency)}${
              p.invoice.totalTzs ? ` · ${formatCurrency(p.invoice.totalTzs, "TZS")}` : ""
            }`,
          },
          {
            label: "Cargo",
            value: mayOpenCargo
              ? link(`/app/cargo/${p.invoice.cargo.id}`, p.invoice.cargo.reference, true)
              : p.invoice.cargo.reference,
          },
          { label: "Goods", value: p.invoice.cargo.description ?? dash },
          { label: "Money reached", value: p.account ? `${p.account.bankName} (${p.account.currency})` : dash },
          { label: "Paid on", value: when(p.paidAt) },
          { label: "Overpayment accepted because", value: p.overpaymentReason ?? dash },
          {
            label: "Shortfall the desk agreed to clear",
            value: p.clearShortfallTzs ? formatCurrency(p.clearShortfallTzs, "TZS") : dash,
          },
          {
            label: "Written off with it",
            value:
              offs.length === 0
                ? dash
                : offs
                    .map(
                      (w) =>
                        `${w.reference} · ${formatCurrency(w.amount, w.currency)} · ${w.status}${
                          w.reversedReason ? ` (${w.reversedReason})` : ""
                        }`
                    )
                    .join("; "),
          },
          { label: "Rejected because", value: p.rejectedReason ?? dash },
          { label: "Note", value: p.notes ?? dash },
        ],
      });
    }
  } else if (row.fix?.kind === "expense") {
    const x = await prisma.containerExpense.findUnique({
      where: { id: row.fix.expenseId },
      include: {
        expenseType: { select: { name: true } },
        vendor: { select: { name: true, phone: true } },
        container: { select: { id: true, reference: true } },
        recordedBy: { select: { name: true } },
        billedCustomer: { select: { fullName: true } },
      },
    });
    if (!x) notFound();
    historyKeys.push({ entity: "ContainerExpense", entityId: x.id });
    if (x.receiptUrl) files.push({ url: x.receiptUrl, name: `${x.reference} receipt` });
    facts.push(
      { label: "Recorded by", value: x.recordedBy?.name ?? dash },
      { label: "Recorded", value: when(x.createdAt) }
    );
    sections.push({
      title: x.reference,
      facts: [
        { label: "What it was for", value: x.description ?? dash },
        { label: "Category", value: x.expenseType?.name ?? t(locale, "Uncategorised") },
        { label: "Kind of cost", value: x.scope },
        { label: "Paid to", value: x.vendor ? [x.vendor.name, x.vendor.phone].filter(Boolean).join(" · ") : dash },
        { label: "Their reference", value: x.referenceNumber ?? dash },
        {
          label: "Container",
          value: x.container ? link(`/app/finance/containers/${x.container.id}`, x.container.reference, true) : dash,
        },
        { label: "Amount", value: formatCurrency(x.amount, x.currency) },
        { label: "Rate recorded", value: Number(x.fxRate) > 1 ? formatRate(x.fxRate) : dash },
        { label: "Worth in shillings", value: formatCurrency(row.tzs, "TZS") },
        { label: "Status", value: x.status },
        { label: "Incurred", value: when(x.expenseDate) },
        { label: "Paid", value: when(x.paidDate) },
        {
          label: "Recharged to a customer",
          value: x.billable
            ? `${x.billedCustomer?.fullName ?? t(locale, "The sailing")}${
                x.billedAmount ? ` · ${formatCurrency(x.billedAmount, x.currency)}` : ""
              }`
            : t(locale, "No"),
        },
        { label: "Note", value: x.notes ?? dash },
        { label: "Cancelled", value: when(x.cancelledAt) },
        { label: "Why it was cancelled", value: x.cancelledReason ?? dash },
      ],
    });
  } else if (row.fix?.kind === "transfer") {
    const x = await prisma.accountTransfer.findUnique({
      where: { id: row.fix.transferId },
      include: {
        fromAccount: { select: { id: true, bankName: true, currency: true } },
        toAccount: { select: { id: true, bankName: true, currency: true } },
        recordedBy: { select: { name: true } },
      },
    });
    if (!x) notFound();
    historyKeys.push({ entity: "AccountTransfer", entityId: x.id });
    auditExtra.push({ action: "account.transfer", summary: { startsWith: `${x.reference}:` } });
    facts.push(
      { label: "Recorded by", value: x.recordedBy?.name ?? dash },
      { label: "Recorded", value: when(x.createdAt) }
    );
    sections.push({
      title: x.reference,
      facts: [
        {
          label: "Out of",
          value: link(`/app/finance/accounts/${x.fromAccount.id}`, `${x.fromAccount.bankName} (${x.fromAccount.currency})`),
        },
        {
          label: "Into",
          value: link(`/app/finance/accounts/${x.toAccount.id}`, `${x.toAccount.bankName} (${x.toAccount.currency})`),
        },
        { label: "Left the first account", value: formatCurrency(x.amount, x.fromAccount.currency) },
        {
          label: "Bank charge",
          value: Number(x.charge) > 0 ? formatCurrency(x.charge, x.fromAccount.currency) : t(locale, "none"),
        },
        { label: "Reached the second", value: formatCurrency(x.amountArrived, x.toAccount.currency) },
        { label: "Purpose", value: x.purpose ?? dash },
        { label: "Cancelled", value: when(x.cancelledAt) },
        { label: "Why it was cancelled", value: x.cancelledReason ?? dash },
      ],
    });
  } else {
    const account = await prisma.bankAccount.findUnique({ where: { id: recordId } });
    if (!account) notFound();
    historyKeys.push({ entity: "BankAccount", entityId: account.id });
    sections.push({
      title: `${account.bankName} (${account.currency})`,
      facts: [
        { label: "Opening balance", value: formatCurrency(account.openingBalance, account.currency) },
        { label: "Dated", value: when(account.openingBalanceAt) },
        { label: "Account name", value: account.accountName },
        { label: "Account number", value: account.accountNumber },
        { label: "Put on the system", value: when(account.createdAt) },
        { label: "Set by", value: row.submittedBy?.name ?? dash },
      ],
    });
  }

  const [changes, audits] = await Promise.all([
    prisma.fieldChange.findMany({
      where: {
        OR: historyKeys.map((k) => ({
          entity: k.entity,
          entityId: k.entityId,
          ...(k.entity === "BankAccount" ? { field: "openingBalance" } : {}),
        })),
      },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          ...historyKeys
            .filter((k) => k.entity !== "BankAccount")
            .map((k) => ({ entity: k.entity, entityId: k.entityId })),
          ...historyKeys
            .filter((k) => k.entity === "BankAccount")
            .map((k) => ({ entity: k.entity, entityId: k.entityId, action: "account.opening" })),
          ...auditExtra,
        ],
      },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const history = [
    ...changes.map((c) => ({
      id: c.id,
      at: c.createdAt,
      who: c.actor?.name ?? dash,
      what: `${c.field}: ${c.oldValue ?? dash} → ${c.newValue ?? dash}`,
      why: c.reason,
    })),
    ...audits.map((a) => ({
      id: a.id,
      at: a.createdAt,
      who: a.actor?.name ?? a.actorEmail ?? dash,
      what: a.summary,
      why: null as string | null,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const mayEditRow = row.fix?.kind === "payment" ? mayVerify : row.fix?.kind === "expense" ? mayCost : false;
  const mayCancelRow =
    row.fix?.kind === "payment" ? mayVerify : row.fix?.kind === "expense" ? mayCost : row.fix?.kind === "transfer" ? mayMove : false;
  const accounts = row.fix?.kind === "expense"
    ? await prisma.bankAccount.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, bankName: true, currency: true },
      })
    : [];
  const categories = row.fix?.kind === "expense"
    ? await prisma.expenseType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={row.title}
          description={`${row.type} · ${row.account}`}
          back={{ href: "/app/finance/ledger", label: t(locale, "General ledger") }}
        />
        {row.fix && !row.cancelled ? (
          <div className="pt-8">
            <LedgerRowFix
              subject={row.fix}
              locale={locale}
              mayEdit={mayEditRow}
              mayCancel={mayCancelRow}
              accounts={accounts.map((a) => ({ id: a.id, label: `${a.bankName} (${a.currency})`, currency: a.currency }))}
              categories={categories}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t(locale, inbound ? "Money in" : "Money out")}
              {row.cancelled ? ` · ${t(locale, row.kind === "payment" ? "Reversed" : "Cancelled")}` : ""}
            </p>
            <p
              className={`tnum mt-2 text-4xl font-bold leading-none tracking-tight ${
                row.cancelled ? "text-muted-foreground line-through" : inbound ? "text-success" : "text-destructive"
              }`}
            >
              {inbound ? "+" : "−"}
              {formatCurrency(row.amount, row.currency)}
            </p>
            {row.currency !== "TZS" ? (
              <p className="tnum mt-1.5 text-xs text-muted-foreground">
                {formatCurrency(row.tzs, "TZS")} {t(locale, "at the rate it moved at")}
              </p>
            ) : null}
            {row.writtenOffTzs ? (
              <p className="mt-2 inline-block rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
                {formatCurrency(row.writtenOffTzs, "TZS")} {t(locale, "written off")}
              </p>
            ) : null}
            {row.cancelled && row.cancelledReason ? (
              <p className="mt-2 text-sm text-muted-foreground">{row.cancelledReason}</p>
            ) : null}

            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-2">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-xs text-muted-foreground">{t(locale, f.label)}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
            {row.purpose || row.refs.length > 0 ? (
              <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">
                {[row.purpose, ...row.refs].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </section>

          {sections.map((s) => (
            <section key={s.title} className="rounded-2xl border bg-card p-6">
              <h2 className="font-mono text-sm font-semibold"><Tx>{s.title}</Tx></h2>
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                {s.facts.map((f) => (
                  <div key={f.label}>
                    <dt className="text-xs text-muted-foreground">{t(locale, f.label)}</dt>
                    <dd className="mt-0.5 text-sm font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Paperclip className="size-4 text-muted-foreground" />
                {t(locale, "Attachments")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {files.length === 0 ? t(locale, "none") : `${files.length} ${t(locale, files.length === 1 ? "file" : "files")}`}
              </span>
            </div>
            {files.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                {row.kind === "payment"
                  ? t(locale, "No proof was attached to this payment.")
                  : row.kind === "expense"
                    ? t(locale, "No receipt was attached to this cost. The typed amount is the only record that it happened.")
                    : t(locale, "This kind of movement carries no attachment.")}
              </p>
            ) : (
              <ul className="divide-y">
                {files.map((f) => (
                  <li key={f.url}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 px-5 py-3 text-sm text-brand hover:underline"
                    >
                      <Paperclip className="size-3.5" />
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border bg-card">
            <div className="flex items-center gap-2 border-b px-5 py-3.5">
              <History className="size-4 text-muted-foreground" />
              <h2 className="font-semibold">{t(locale, "History")}</h2>
            </div>
            {history.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">{t(locale, "Nothing has been changed since it was recorded.")}</p>
            ) : (
              <ol className="divide-y">
                {history.map((h) => (
                  <li key={h.id} className="px-5 py-3 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(h.at)} · {h.who}
                    </p>
                    <p className="mt-0.5 break-words">{h.what}</p>
                    {h.why ? <p className="mt-0.5 text-xs text-muted-foreground">{h.why}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
