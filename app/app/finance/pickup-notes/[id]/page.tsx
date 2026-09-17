import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PrintButton } from "@/components/app/print-button";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { composeMessage, whatsappNumber } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { qrDataUrl, qrPayload } from "@/lib/qr";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const note = await prisma.pickupNote.findUnique({
    where: { id },
    select: { noteNumber: true, customer: { select: { fullName: true } } },
  });
  return {
    title: {
      absolute: note
        ? `${note.noteNumber} - ${note.customer.fullName}`
        : "Pickup note",
    },
  };
}

/**
 * THE NOTE ITSELF.
 *
 * What the customer brings to the counter, on paper or on a phone. The code is
 * scanned at the door; the figures on it are the snapshot taken when it was
 * written, and they stay true even if the invoice moves afterwards.
 */
export default async function PickupNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("finance.view");
  const { id } = await params;

  const [note, company] = await Promise.all([
    prisma.pickupNote.findUnique({
      where: { id },
      include: {
        customer: true,
        cargo: {
          include: {
            darReceiving: true,
            containerLines: {
              take: 1,
              orderBy: { createdAt: "desc" },
              include: { container: { select: { reference: true } } },
            },
          },
        },
        issuedBy: { select: { name: true } },
      },
    }),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!note) notFound();

  const qr = await qrDataUrl(qrPayload(note.qrToken), 420);
  const container = note.cargo.containerLines[0]?.container ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <SmartBack fallbackHref="/app/finance/pickup-notes" fallbackLabel="All pickup notes" />
        <div className="flex items-center gap-2">
          <WhatsAppButton
            cargoId={note.cargoId}
            phone={whatsappNumber(note.customer.phone)}
            kind="cargo.ready"
            label="Send to customer"
            message={composeMessage("cargo.ready", {
              customerName: note.customer.fullName,
              reference: note.cargo.reference,
            })}
          />
          <PrintButton label="Print note" />
        </div>
      </div>

      <article className="rounded-lg border bg-white p-8 text-black print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b-2 border-black/70 pb-5">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/swift-cargo.png"
              alt=""
              width={52}
              height={52}
              className="object-contain"
            />
            <div>
              <p className="text-lg font-bold uppercase tracking-wider text-navy-700">
                {company?.name ?? "Swift Cargo"}
              </p>
              <p className="text-xs text-neutral-500">
                {company?.darAddress ?? "Dar es Salaam"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">
              Pickup note
            </p>
            <p className="tnum text-lg font-bold">{note.noteNumber}</p>
            {note.status !== "ACTIVE" ? (
              <p className="mt-1 text-xs font-bold uppercase text-red-600">
                {note.status === "USED" ? "Already collected" : "Withdrawn"}
              </p>
            ) : null}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b py-6 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Collect by
            </p>
            <p className="mt-1 text-lg font-bold">{note.customer.fullName}</p>
            <p className="tnum text-sm text-neutral-600">
              {note.customer.phone}
            </p>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Bring photo ID
            </p>
          </div>
          <div className="flex justify-end">
            <Image src={qr} alt="" width={140} height={140} unoptimized />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-x-6 gap-y-4 border-b py-6 text-sm sm:grid-cols-3">
          {[
            ["Cargo", note.cargo.reference],
            ["Container", container?.reference ?? "—"],
            [
              "Packages",
              note.cargo.darReceiving
                ? String(note.cargo.darReceiving.packagesCount)
                : "—",
            ],
            ["Settled", formatMoney(note.amountPaid, note.currency)],
            [
              "In shillings",
              note.amountTzs ? formatMoney(note.amountTzs, "TZS") : "—",
            ],
            ["Issued", formatDateTime(note.issuedAt)],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                {label}
              </p>
              <p className="tnum mt-0.5 font-medium">{value}</p>
            </div>
          ))}
        </section>

        <section className="pt-6 text-[11px] leading-relaxed text-neutral-600">
          <p className="font-semibold text-black">
            This note is the authority to release the cargo above.
          </p>
          <p className="mt-1">
            It is settled in full. Our warehouse will check the boxes against it
            and ask for identification. Keep it — it is valid once only, and is
            marked used the moment the goods are handed over.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-8">
            <div className="border-t border-black/60 pt-1.5">
              <p>Collected by — name and signature</p>
            </div>
            <div className="border-t border-black/60 pt-1.5">
              <p>Released by — {note.issuedBy?.name ?? "Swift Cargo"}</p>
            </div>
          </div>
        </section>
      </article>

      <div className="print:hidden">
        <Badge tone={note.status === "ACTIVE" ? "good" : "neutral"}>
          {note.status === "ACTIVE"
            ? "Waiting to collect"
            : note.status === "USED"
              ? `Collected ${formatDateTime(note.usedAt)}`
              : `Withdrawn — ${note.cancelReason ?? "no reason given"}`}
        </Badge>
      </div>
    </div>
  );
}
