import Link from "next/link";
import type { Metadata } from "next";
import { Camera, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { RestoreCargoButton } from "@/components/app/restore-cargo-button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import { formatCbm, formatDateTime, formatWeight } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
import { Tx } from "@/components/app/tx";
export const metadata: Metadata = { title: "Deleted records" };

type Who = { name: string; at: Date; summary: string; metadata: unknown };

/**
 * Who took each record out, and when — read from the audit log.
 *
 * The soft-deleted and cancelled rows carry the fact and, mostly, the reason,
 * but not the person: that lives on the append-only line written in the same
 * breath. The newest matching line per record is the one that put it where it
 * is now.
 */
async function whoDid(entities: string[], ids: string[], actions: string[]) {
  const map = new Map<string, Who>();
  if (ids.length === 0) return map;
  const rows = await prisma.auditLog.findMany({
    where: { entity: { in: entities }, entityId: { in: ids }, action: { in: actions } },
    orderBy: { createdAt: "desc" },
    select: {
      entityId: true,
      createdAt: true,
      summary: true,
      metadata: true,
      actorEmail: true,
      actor: { select: { name: true } },
    },
  });
  for (const row of rows) {
    if (!row.entityId || map.has(row.entityId)) continue;
    map.set(row.entityId, {
      name: row.actor?.name ?? row.actorEmail ?? "System",
      at: row.createdAt,
      summary: row.summary,
      metadata: row.metadata,
    });
  }
  return map;
}

function reasonIn(who: Who | undefined): string | null {
  const meta = who?.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const reason = (meta as Record<string, unknown>).reason;
    if (typeof reason === "string" && reason.trim()) return reason.trim();
  }
  const dash = who?.summary.indexOf(" — ") ?? -1;
  return who && dash !== -1 ? who.summary.slice(dash + 3) : null;
}

const PAYMENT_LABEL = {
  CANCELLED: "payment cancelled",
  REVERSED: "payment reversed",
  REJECTED: "sent back",
} as const;

/**
 * Everything that was deleted or taken back, and why.
 *
 * The point of soft delete is this page. A record removed from the working
 * system is still a record: who took it out, when, on what grounds, and what it
 * said at the time. Photos survive deletion too, which is what stops a deletion
 * from being a way to make evidence disappear. Nothing on this page destroys
 * anything — there is no purge, by design.
 */
export default async function DeletedRecordsPage() {
  await primeLocale();
  const user = await requirePermission("records.viewDeleted");
  const locale = await localeOf(user.id);

  /* Reading why something went and putting it back are different authorities.
     Getting in is records.viewDeleted; restoring is cargo.delete, the same
     authority it took to remove it. A control nobody may press is not drawn. */
  const canRestore = can(user.role, "cargo.delete");

  const [payments, transfers, cargo, packages, containers, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { status: { in: ["CANCELLED", "REVERSED", "REJECTED"] } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        reference: true,
        status: true,
        amount: true,
        currency: true,
        baseCurrencyAmount: true,
        writtenOff: true,
        writeOffOfId: true,
        rejectedReason: true,
        reversedReason: true,
        reversedAt: true,
        updatedAt: true,
        customer: { select: { fullName: true } },
        invoice: { select: { number: true, cargo: { select: { reference: true } } } },
      },
    }),
    prisma.accountTransfer.findMany({
      where: { cancelledAt: { not: null } },
      orderBy: { cancelledAt: "desc" },
      take: 100,
      select: {
        id: true,
        reference: true,
        amount: true,
        cancelledAt: true,
        cancelledReason: true,
        fromAccount: { select: { bankName: true, currency: true } },
        toAccount: { select: { bankName: true } },
      },
    }),
    prisma.cargo.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 200,
      select: {
        id: true,
        reference: true,
        description: true,
        status: true,
        deletedAt: true,
        sender: { select: { fullName: true } },
        receiver: { select: { fullName: true, phone: true } },
        createdBy: { select: { name: true } },
        photos: { select: { id: true, url: true } },
        _count: { select: { packages: true } },
      },
    }),
    prisma.cargoPackage.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 100,
      select: {
        id: true,
        reference: true,
        description: true,
        quantity: true,
        cbm: true,
        weightKg: true,
        deletedAt: true,
        cargo: { select: { reference: true } },
      },
    }),
    prisma.container.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 100,
      select: {
        id: true,
        reference: true,
        containerNumber: true,
        type: true,
        status: true,
        deletedAt: true,
        _count: { select: { cargoLines: true, expenses: true } },
      },
    }),
    prisma.containerExpense.findMany({
      where: { OR: [{ deletedAt: { not: null } }, { cancelledAt: { not: null } }] },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        reference: true,
        amount: true,
        currency: true,
        description: true,
        scope: true,
        cancelledAt: true,
        cancelledReason: true,
        deletedAt: true,
        expenseType: { select: { name: true } },
        container: { select: { reference: true } },
      },
    }),
  ]);

  /* A write-off rides on the payment that left the shortfall and is taken back
     with it, writing no line of its own — so its "who" is the parent's. */
  const paymentIds = payments.map((p) => p.writeOffOfId ?? p.id);
  const [paymentWho, transferWho, cargoWho, packageWho, containerWho, expenseWho] =
    await Promise.all([
      whoDid(["Payment"], paymentIds, ["payment.cancel", "payment.reject", "payment.reverse"]),
      whoDid(["AccountTransfer"], transfers.map((x) => x.id), ["account.transfer.cancel"]),
      whoDid(["Cargo"], cargo.map((x) => x.id), ["cargo.delete"]),
      whoDid(["CargoPackage"], packages.map((x) => x.id), ["cargo.package.delete"]),
      whoDid(["Container"], containers.map((x) => x.id), ["container.delete"]),
      whoDid(["ContainerExpense"], expenses.map((x) => x.id), ["expense.cancel", "expense.delete"]),
    ]);

  const nothingMoney = payments.length === 0 && transfers.length === 0;
  const nothingCargo = cargo.length === 0 && packages.length === 0;
  const nothingContainers = containers.length === 0 && expenses.length === 0;

  const byLine = (who: Who | undefined, fallbackAt: Date | null) => {
    const at = who?.at ?? fallbackAt;
    return `${who ? ` · ${t(locale, "by")} ${who.name}` : ""}${at ? ` · ${formatDateTime(at)}` : ""}`;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={t(locale, "Deleted records")}
        description={t(
          locale,
          "Nothing is ever destroyed. Every deletion and every cancelled payment is kept here with its reason and the person who made it."
        )}
      />

      {/* The money corrections first: they are the ones with a figure attached,
          and a figure somebody took back is what gets asked about. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t(locale, "Cancelled money")}</h2>
        {nothingMoney ? (
          <Empty text={t(locale, "No payment or transfer has been taken back.")} />
        ) : (
          <Card>
            <ul className="divide-y">
              {payments.map((p) => {
                const who = paymentWho.get(p.writeOffOfId ?? p.id);
                const reason =
                  p.status === "REVERSED"
                    ? p.reversedReason
                    : p.status === "REJECTED"
                      ? p.rejectedReason
                      : reasonIn(who);
                const label = p.writtenOff
                  ? "write-off taken back"
                  : PAYMENT_LABEL[p.status as keyof typeof PAYMENT_LABEL];
                return (
                  <li key={p.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold">
                        {p.customer.fullName}
                        <span
                          className={
                            p.status === "REJECTED"
                              ? "ml-2 text-[11px] font-normal text-muted-foreground"
                              : "ml-2 text-[11px] font-normal text-warning"
                          }
                        >
                          {t(locale, label)}
                        </span>
                      </p>
                      <div className="shrink-0 text-right">
                        <p className="tnum text-sm font-semibold line-through opacity-70">
                          {formatCurrency(p.amount, p.currency)}
                        </p>
                        {/* Balances are kept in shillings, so the shilling figure
                            is what this line no longer counts for. */}
                        {p.currency !== "TZS" && p.baseCurrencyAmount ? (
                          <p className="tnum text-[11px] text-muted-foreground line-through">
                            {formatCurrency(p.baseCurrencyAmount, "TZS")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">
                        {p.reference} · {p.invoice.number} · {p.invoice.cargo.reference}
                      </span>
                      {byLine(who, p.reversedAt ?? p.updatedAt)}
                      {reason ? ` — “${reason}”` : ""}
                    </p>
                  </li>
                );
              })}
              {transfers.map((x) => {
                const who = transferWho.get(x.id);
                return (
                  <li key={x.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold">
                        {x.fromAccount.bankName} → {x.toAccount.bankName}
                        <span className="ml-2 text-[11px] font-normal text-warning">
                          {t(locale, "transfer cancelled")}
                        </span>
                      </p>
                      <p className="tnum shrink-0 text-sm font-semibold line-through opacity-70">
                        {formatCurrency(x.amount, x.fromAccount.currency)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">{x.reference}</span>
                      {byLine(who, x.cancelledAt)}
                      {x.cancelledReason ? ` — “${x.cancelledReason}”` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t(locale, "Deleted cargo")}</h2>
        {nothingCargo ? (
          <Empty
            icon
            text={t(
              locale,
              "Deleted cargo appears here, with everything it had at the moment it was removed."
            )}
          />
        ) : (
          <div className="space-y-4">
            {cargo.map((c) => {
              const who = cargoWho.get(c.id);
              const reason = reasonIn(who);
              return (
                <Card key={c.id} className="border-warning/30 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-mono text-base font-bold">{c.reference}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {c.receiver.fullName}
                        {c.receiver.phone ? ` · ${c.receiver.phone}` : ""}
                      </p>
                    </div>
                    {canRestore ? (
                      <RestoreCargoButton cargoId={c.id} reference={c.reference} />
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                      {t(locale, "Reason")}
                    </p>
                    <p className="mt-1 text-sm">{reason ?? t(locale, "No reason recorded")}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {t(locale, "Deleted by")}{" "}
                      {who?.name ?? t(locale, "nobody on record")}
                      {c.deletedAt ? ` · ${formatDateTime(c.deletedAt)}` : ""}
                    </p>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-4">
                    {[
                      { label: "Cargo", value: c.description },
                      { label: "Sender", value: c.sender.fullName },
                      { label: "Package lines", value: String(c._count.packages) },
                      { label: "Received by", value: c.createdBy?.name ?? "—" },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{t(locale, item.label)}</dt>
                        <dd className="mt-0.5 truncate font-medium">{item.value}</dd>
                      </div>
                    ))}
                  </dl>

                  {c.photos.length > 0 ? (
                    <div className="mt-4 border-t pt-4">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Camera className="size-3.5" />
                        {c.photos.length}{" "}
                        {c.photos.length === 1 ? t(locale, "photo") : t(locale, "photos")}{" "}
                        {t(locale, "preserved")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {c.photos.map((photo) => (
                          <a
                            key={photo.id}
                            href={photo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block size-14 overflow-hidden rounded border"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.url}
                              alt={`${t(locale, "Preserved photo for")} ${c.reference}`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Card>
              );
            })}

            {packages.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {t(locale, "Package lines removed from a consignment")}
                </h3>
                <Card>
                  <ul className="divide-y">
                    {packages.map((line) => {
                      const who = packageWho.get(line.id);
                      return (
                        <li key={line.id} className="px-5 py-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-semibold">
                              <span className="font-mono">{line.reference}</span>
                              {line.description ? (
                                <span className="ml-2 font-normal text-muted-foreground">
                                  <Tx>{line.description}</Tx>
                                </span>
                              ) : null}
                            </p>
                            <p className="tnum shrink-0 text-xs text-muted-foreground">
                              {line.quantity} · {formatCbm(line.cbm)} CBM
                              {line.weightKg ? ` · ${formatWeight(line.weightKg)}` : ""}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            <span className="font-mono">{line.cargo.reference}</span>
                            {byLine(who, line.deletedAt)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t(locale, "Deleted containers and costs")}</h2>
        {nothingContainers ? (
          <Empty text={t(locale, "No container or cost has been deleted or cancelled.")} />
        ) : (
          <Card>
            <ul className="divide-y">
              {containers.map((box) => {
                const who = containerWho.get(box.id);
                const reason = reasonIn(who);
                return (
                  <li key={box.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold">
                        <span className="font-mono">{box.reference}</span>
                        {box.containerNumber ? (
                          <span className="ml-2 font-normal text-muted-foreground">
                            {box.containerNumber}
                          </span>
                        ) : null}
                        <span className="ml-2 text-[11px] font-normal text-warning">
                          {t(locale, "container deleted")}
                        </span>
                      </p>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {box._count.cargoLines} {t(locale, "consignments")} · {box._count.expenses}{" "}
                        {t(locale, "costs")}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t(locale, box.status)}
                      {byLine(who, box.deletedAt)}
                      {reason ? ` — “${reason}”` : ""}
                    </p>
                  </li>
                );
              })}
              {expenses.map((x) => {
                const who = expenseWho.get(x.id);
                const reason = x.cancelledReason ?? reasonIn(who);
                return (
                  <li key={x.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold">
                        {x.expenseType?.name ?? x.description ?? t(locale, "Cost")}
                        <span className="ml-2 text-[11px] font-normal text-warning">
                          {x.deletedAt ? t(locale, "cost deleted") : t(locale, "cost cancelled")}
                        </span>
                      </p>
                      <p className="tnum shrink-0 text-sm font-semibold line-through opacity-70">
                        {formatCurrency(x.amount, x.currency)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">
                        {x.reference}
                        {x.container ? ` · ${x.container.reference}` : ""}
                      </span>
                      {byLine(who, x.deletedAt ?? x.cancelledAt)}
                      {reason ? ` — “${reason}”` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <p className="text-sm text-muted-foreground">
        {t(locale, "Every deletion and restore is also written to the")}{" "}
        <Link href="/app/admin/audit" className="text-brand hover:underline">
          {t(locale, "audit log")}
        </Link>
        .
      </p>
    </div>
  );
}

function Empty({ text, icon }: { text: string; icon?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-8 text-center">
      {icon ? <Trash2 className="mx-auto size-6 text-muted-foreground/50" /> : null}
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
