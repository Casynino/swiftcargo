import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { PrintButton } from "@/components/app/print-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { qrDataUrl, qrPayload } from "@/lib/qr";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "Pickup note" };

/**
 * The customer's pickup note, with the code the Dar counter scans.
 *
 * Found by id AND the session's customer together, so a note number typed
 * into the address bar finds nothing unless it is already theirs. Showing the
 * code to its owner lets nothing go by itself: the counter still runs the
 * release check on every scan.
 */
export default async function PortalPickupNotePage({ params }: { params: Promise<{ id: string }> }) {
  const locale = DEFAULT_LOCALE;
  const user = await requireCustomer();
  const { id } = await params;

  const note = await prisma.pickupNote.findFirst({
    where: { id, customerId: user.customerId },
    select: {
      noteNumber: true,
      qrToken: true,
      status: true,
      issuedAt: true,
      usedAt: true,
      onCredit: true,
      amountPaid: true,
      currency: true,
      amountTzs: true,
      customer: { select: { fullName: true, code: true } },
      cargo: {
        select: {
          reference: true,
          description: true,
          darReceiving: { select: { packagesCount: true } },
          containerLines: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { container: { select: { reference: true } } },
          },
        },
      },
    },
  });
  if (!note) notFound();

  const active = note.status === "ACTIVE";
  const qr = active ? await qrDataUrl(qrPayload(note.qrToken), 520) : null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/portal/pickups" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          {t(locale, "My pickups")}
        </Link>
        <PrintButton label={t(locale, "Print")} />
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-brand to-marine px-5 py-4 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">
            {t(locale, "Pickup note")} · Hati ya kuchukua mzigo
          </p>
          <p className="tnum mt-1 text-2xl font-extrabold">{note.noteNumber}</p>
          <p className="text-xs text-white/75">
            {t(locale, "Issued")} {formatDateTime(note.issuedAt)}
          </p>
        </div>

        <div className="flex flex-col items-center p-5 text-center">
          {qr ? (
            <>
              <span className="rounded-2xl bg-white p-3 shadow-soft ring-1 ring-black/5">
                <Image src={qr} alt={t(locale, "Pickup code")} width={240} height={240} unoptimized />
              </span>
              <p className="mt-3 text-sm font-semibold">{t(locale, "Show this code at the Dar warehouse counter")}</p>
              <p className="text-xs text-muted-foreground">
                {t(locale, "Bring photo ID. The code works once.")}
              </p>
            </>
          ) : (
            <Badge tone={note.status === "USED" ? "neutral" : "bad"}>
              {note.status === "USED"
                ? `${t(locale, "Collected")} ${note.usedAt ? formatDateTime(note.usedAt) : ""}`
                : t(locale, "This note was withdrawn. Ask us for a new one.")}
            </Badge>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-px border-t bg-border text-sm">
          {[
            ["Collect by", note.customer.fullName],
            ["Customer", note.customer.code],
            ["Cargo", note.cargo.reference],
            ["Container", note.cargo.containerLines[0]?.container.reference ?? "—"],
            ["Boxes", note.cargo.darReceiving ? String(note.cargo.darReceiving.packagesCount) : "—"],
            [note.onCredit ? "Paid so far" : "Paid", note.amountTzs ? formatMoney(note.amountTzs, "TZS") : formatMoney(note.amountPaid, note.currency)],
          ].map(([k, v]) => (
            <div key={k} className="bg-card px-4 py-3">
              <dt className="text-xs text-muted-foreground">{t(locale, k)}</dt>
              <dd className="tnum mt-0.5 truncate font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
