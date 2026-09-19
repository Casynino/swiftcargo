import Link from "next/link";
import type { Metadata } from "next";
import { Download, FileText, QrCode, Receipt } from "lucide-react";

import { Card } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "My documents" };

/**
 * The paper the customer holds with us: bills, receipts, pickup notes.
 *
 * Only documents written for the customer. Packing lists, manifests and the
 * warehouse's own sheets name other people's cargo and stay with the staff.
 */
export default async function DocumentsPage() {
  const locale = DEFAULT_LOCALE;
  const user = await requireCustomer();

  const [invoices, receipts, notes] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId: user.customerId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, number: true, issuedAt: true, createdAt: true, total: true, currency: true },
    }),
    prisma.receipt.findMany({
      where: { customerId: user.customerId },
      orderBy: { issuedAt: "desc" },
      take: 50,
      select: { id: true, number: true, issuedAt: true, amount: true, currency: true, invoiceId: true },
    }),
    prisma.pickupNote.findMany({
      where: { customerId: user.customerId },
      orderBy: { issuedAt: "desc" },
      take: 50,
      select: { id: true, noteNumber: true, issuedAt: true, cargo: { select: { reference: true } } },
    }),
  ]);

  const empty = invoices.length + receipts.length + notes.length === 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t(locale, "My documents")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "Your invoices, payment receipts and pickup notes, ready to open or download.")}
        </p>
      </header>

      {empty ? (
        <Card className="p-8 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-semibold">{t(locale, "No documents yet")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {t(locale, "Your invoice appears here once we confirm your charges, then receipts as you pay.")}
          </p>
        </Card>
      ) : null}

      {invoices.length > 0 ? (
        <Group title="Invoices">
          {invoices.map((i) => (
            <Row
              key={i.id}
              icon={FileText}
              title={i.number}
              sub={`${formatDate(i.issuedAt ?? i.createdAt)} · ${formatMoney(i.total, i.currency)}`}
              href={`/portal/invoices/${i.id}`}
              download={`/portal/invoices/${i.id}/pdf`}
            />
          ))}
        </Group>
      ) : null}

      {receipts.length > 0 ? (
        <Group title="Payment receipts">
          {receipts.map((r) => (
            <Row
              key={r.id}
              icon={Receipt}
              title={r.number}
              sub={`${formatDate(r.issuedAt)} · ${formatMoney(r.amount, r.currency)}`}
              href={`/portal/invoices/${r.invoiceId}`}
            />
          ))}
        </Group>
      ) : null}

      {notes.length > 0 ? (
        <Group title="Pickup notes">
          {notes.map((n) => (
            <Row
              key={n.id}
              icon={QrCode}
              title={n.noteNumber}
              sub={`${formatDate(n.issuedAt)} · ${n.cargo.reference}`}
              href={`/portal/pickups/${n.id}`}
            />
          ))}
        </Group>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      <Card className="divide-y">{children}</Card>
    </section>
  );
}

function Row({
  icon: Icon,
  title,
  sub,
  href,
  download,
}: {
  icon: typeof FileText;
  title: string;
  sub: string;
  href: string;
  download?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
        <Icon className="size-5" />
      </span>
      <Link href={href} className="min-w-0 flex-1 hover:text-brand">
        <p className="tnum truncate font-semibold">{title}</p>
        <p className="tnum truncate text-xs text-muted-foreground">{sub}</p>
      </Link>
      {download ? (
        <a
          href={download}
          aria-label={`Download ${title}`}
          className="grid size-10 shrink-0 place-items-center rounded-full border text-muted-foreground hover:text-foreground"
        >
          <Download className="size-4" />
        </a>
      ) : null}
    </div>
  );
}
