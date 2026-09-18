import Image from "next/image";
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
            sender: { select: { fullName: true } },
            boxes: {
              where: { voidedAt: null },
              orderBy: { sequence: "asc" },
              include: { package: { select: { reference: true, description: true, descriptionZh: true } } },
            },
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

  const qr = await qrDataUrl(qrPayload(note.qrToken), 520);
  const container = note.cargo.containerLines[0]?.container ?? null;
  const boxes = note.cargo.boxes;
  const packages = boxes.length || note.cargo.darReceiving?.packagesCount || 0;

  const stamp =
    note.status === "ACTIVE"
      ? note.onCredit
        ? { text: "Released on credit", tone: "border-amber-500 text-amber-600" }
        : { text: "Paid · valid", tone: "border-emerald-600 text-emerald-600" }
      : note.status === "USED"
        ? { text: "Collected", tone: "border-neutral-500 text-neutral-500" }
        : { text: "Withdrawn", tone: "border-red-600 text-red-600" };

  const label = "text-[8px] font-bold uppercase tracking-[0.18em] text-neutral-500";

  return (
    <div className="mx-auto max-w-[820px] space-y-6 print:max-w-none print:space-y-0">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .pn-sheet { width: 210mm; min-height: 297mm; padding: 12mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .update-pill { display: none !important; }
        }
      `}</style>

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

      <article className="pn-sheet mx-auto overflow-hidden bg-white text-[#0b1b2b] shadow-raised ring-1 ring-black/5 print:shadow-none print:ring-0">
        {/* ------------------------------------------------------ Letterhead */}
        <header className="relative overflow-hidden bg-[#0b2742] px-8 py-6 text-white print:rounded-xl">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_90%_-20%,rgba(79,201,240,0.35),transparent_60%),radial-gradient(ellipse_at_0%_130%,rgba(244,97,31,0.35),transparent_55%)]"
          />
          <div className="relative flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <span className="grid size-14 place-items-center rounded-2xl bg-white p-1">
                <Image src="/brand/swift-cargo.png" alt="" width={52} height={52} className="object-contain" />
              </span>
              <div>
                <p className="text-xl font-extrabold uppercase tracking-[0.12em]">{company?.name ?? "Swift Cargo"}</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#ffb27d]">
                  {company?.tagline ?? "On time, every time"}
                </p>
                <p className="mt-1 max-w-sm text-[10px] leading-snug text-white/75">
                  {company?.darAddress ?? "Dar es Salaam"}
                  {company?.phone ? ` · ${company.phone}` : ""}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#9fd8f5]">Pickup note</p>
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/60">Hati ya kuchukua mzigo</p>
              <p className="tnum mt-1 text-2xl font-extrabold tracking-tight">{note.noteNumber}</p>
              <p className="text-[10px] text-white/70">Issued {formatDateTime(note.issuedAt)}</p>
            </div>
          </div>
          <div className="relative mt-5 h-1 rounded-full bg-gradient-to-r from-[#f4611f] via-[#ffb27d] to-[#4fc9f0]" />
        </header>

        <div className="px-8 py-6">
          {/* ------------------------------------------ Who, and the code */}
          <section className="grid grid-cols-[1fr_auto] items-stretch gap-6">
            <div className="flex flex-col justify-between rounded-2xl border border-[#d6e2ee] bg-[#f5f9fc] p-5">
              <div>
                <p className={label}>Collect by · Anayechukua</p>
                <p className="mt-1 text-2xl font-extrabold uppercase leading-tight">{note.customer.fullName}</p>
                <p className="tnum text-sm text-neutral-600">
                  {note.customer.code} · {note.customer.phone}
                </p>
                {note.cargo.sender.fullName !== note.customer.fullName ? (
                  <p className="mt-1 text-xs text-neutral-500">Sent by {note.cargo.sender.fullName}</p>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className={`rotate-[-4deg] rounded-md border-2 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.2em] ${stamp.tone}`}>
                  {stamp.text}
                </span>
                <span className="rounded-full bg-[#0b2742] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                  Bring photo ID · Leta kitambulisho
                </span>
              </div>
            </div>
            <div className="flex w-[52mm] flex-col items-center justify-center rounded-2xl bg-[#0b2742] p-3 text-center text-white">
              <span className="rounded-xl bg-white p-1.5">
                <Image src={qr} alt="" width={170} height={170} unoptimized style={{ width: "40mm", height: "40mm" }} />
              </span>
              <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9fd8f5]">Scan at the Dar counter</p>
              <p className="text-[8px] text-white/60">Valid once only</p>
            </div>
          </section>

          {/* ------------------------------------------------ The cargo */}
          <section className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[#d6e2ee] bg-[#d6e2ee]">
            {[
              ["Tracking no.", note.cargo.reference],
              ["Container", container?.reference ?? "—"],
              ["Boxes to collect", packages ? String(packages) : "—"],
              [note.onCredit ? "Paid so far" : "Settled", formatMoney(note.amountPaid, note.currency)],
              ["In shillings", note.amountTzs ? formatMoney(note.amountTzs, "TZS") : "—"],
              ["Goods", note.cargo.description],
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-4 py-3">
                <p className={label}>{k}</p>
                <p className="tnum mt-0.5 truncate text-sm font-bold">{v}</p>
              </div>
            ))}
          </section>

          {note.onCredit ? (
            <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              <strong>Released on credit.</strong> {note.creditReason ?? ""}
              {note.creditDueAt ? ` Balance due by ${formatDateTime(note.creditDueAt)}.` : ""} The customer still owes the balance.
            </p>
          ) : null}

          {/* ---------------------------------- Every box, checked out */}
          {boxes.length > 0 ? (
            <section className="mt-5">
              <div className="flex items-end justify-between">
                <p className="text-sm font-extrabold uppercase tracking-wide">Boxes · Mizigo</p>
                <p className="text-[10px] text-neutral-500">Each box is scanned as it is handed over</p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-2xl border border-[#d6e2ee] p-4 sm:grid-cols-3">
                {boxes.map((box) => (
                  <div key={box.id} className="flex items-center gap-2 border-b border-dashed border-[#e3eaf1] py-1 text-[11px]">
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded border ${
                        box.collectedAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-neutral-400"
                      }`}
                    >
                      {box.collectedAt ? "✓" : ""}
                    </span>
                    <span className="tnum font-bold">
                      {box.sequence}/{boxes.length}
                    </span>
                    <span className="truncate text-neutral-600">{box.package.description ?? box.package.reference}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* --------------------------------------------- The terms */}
          <section className="mt-5 grid grid-cols-2 gap-4 text-[10.5px] leading-relaxed">
            <div className="rounded-2xl bg-[#f5f9fc] p-4">
              <p className="font-extrabold uppercase tracking-wide text-[#0b2742]">This note releases the cargo above</p>
              <p className="mt-1 text-neutral-600">
                Our warehouse checks every box against it and asks for identification. It is valid once only and is
                marked used the moment the goods are handed over.
              </p>
            </div>
            <div className="rounded-2xl bg-[#fff2ea] p-4">
              <p className="font-extrabold uppercase tracking-wide text-[#b3440f]">Hati hii ni idhini ya kuchukua mzigo</p>
              <p className="mt-1 text-neutral-700">
                Ghala letu litakagua kila mzigo na kuomba kitambulisho chenye picha. Inatumika mara moja tu, na
                itawekwa alama ya kutumika mara mzigo utakapokabidhiwa.
              </p>
            </div>
          </section>

          {/* ------------------------------------------ Signatures */}
          <section className="mt-8 grid grid-cols-2 gap-8">
            {[
              ["Collected by · Aliyechukua", "Name, ID number and signature"],
              ["Released by · Aliyekabidhi", note.issuedBy?.name ? `Note issued by ${note.issuedBy.name}` : "Name and signature"],
            ].map(([title, sub]) => (
              <div key={title}>
                <div className="h-10 border-b border-dashed border-neutral-400" />
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-neutral-600">{title}</p>
                <p className="text-[9px] text-neutral-400">{sub}</p>
              </div>
            ))}
          </section>

          <footer className="mt-6 flex items-center justify-between border-t border-[#d6e2ee] pt-3 text-[9px] text-neutral-500">
            <span>{company?.email ?? ""}{company?.altPhone ? ` · ${company.altPhone}` : ""}</span>
            <span className="font-bold uppercase tracking-[0.2em] text-[#0b2742]">{company?.name ?? "Swift Cargo"}</span>
          </footer>
        </div>
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
