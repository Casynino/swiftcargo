import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PrintButton } from "@/components/app/print-button";
import { formatDate, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";
import { distinctMark } from "@/lib/customer-name";

export const metadata: Metadata = { title: "Delivery note" };

type Snapshot = {
  cargoReference: string;
  shippingMark: string | null;
  sender: { name: string; phone: string; code: string };
  receiver: { name: string; phone: string };
  supplier: string | null;
  supplierRef: string | null;
  description: string;
  warehouse: string;
  receivedAt: string;
  packagesCount: number;
  piecesCount: number | null;
  weightKg: string | null;
  cbm: string;
  condition: string;
  lines: {
    reference: string;
    type: string;
    description: string | null;
    quantity: number;
    unit: string;
    length: string | null;
    width: string | null;
    height: string | null;
    cbm: string;
    weightKg: string | null;
    balerNumber: string | null;
  }[];
};

/**
 * The paper the customer keeps.
 *
 * Rendered ENTIRELY from the note's own snapshot, never from the live cargo
 * record. The record can be corrected afterwards; this document made a claim on
 * a date and has to go on making the same one, or it is no longer evidence of
 * anything.
 */
export default async function DeliveryNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("deliveryNote.view");
  const { id } = await params;

  const note = await prisma.deliveryNote.findUnique({
    where: { cargoId: id },
    include: { issuedBy: { select: { name: true } } },
  });
  if (!note) notFound();

  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
  });

  const snap = note.snapshot as unknown as Snapshot;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/cargo/${id}`} fallbackLabel={`${snap.cargoReference}`} />
        <PrintButton label="Print delivery note" />
      </div>

      <article className="rounded-lg border bg-white p-8 text-black print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b pb-6">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/swift-cargo.png"
              alt=""
              width={56}
              height={56}
              className="object-contain"
            />
            <div>
              <p className="text-lg font-bold uppercase tracking-wider text-navy-700">
                {company?.name ?? "Swift Cargo"}
              </p>
              <p className="text-xs text-neutral-500">
                {company?.tagline ?? "On time, Every time"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">
              Delivery Note
            </p>
            <p className="tnum text-lg font-bold">{note.number}</p>
            <p className="text-xs text-neutral-500">
              {formatDate(note.issuedAt)}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b py-6 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Name / shipping mark
            </p>
            <p className="mt-1 text-lg font-bold">{snap.sender.name}</p>
            <p className="tnum text-sm text-neutral-600">{snap.sender.phone}</p>
            <p className="tnum text-sm text-neutral-600">{snap.sender.code}</p>
          </div>
          <div>
            {distinctMark(snap.sender.name, snap.shippingMark) ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                  Shipping mark
                </p>
                <p className="tnum mt-1 text-lg font-bold">{snap.shippingMark}</p>
              </>
            ) : null}
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
              Cargo reference
            </p>
            <p className="tnum font-medium">{snap.cargoReference}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-x-6 gap-y-4 border-b py-6 text-sm sm:grid-cols-4">
          {[
            ["Received at", snap.warehouse],
            ["Date received", formatDateTime(snap.receivedAt)],
            ["Supplier", snap.supplier ?? "—"],
            ["Supplier ref", snap.supplierRef ?? "—"],
            ["Packages", String(snap.packagesCount)],
            ["Pieces", snap.piecesCount ? String(snap.piecesCount) : "—"],
            ["Weight", snap.weightKg ? `${snap.weightKg} kg` : "—"],
            ["Volume", `${Number(snap.cbm).toFixed(3)} CBM`],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                {label}
              </p>
              <p className="tnum mt-0.5 font-medium">{value}</p>
            </div>
          ))}
        </section>

        <section className="py-6">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            Cargo
          </p>
          <p className="mt-1 font-medium">{snap.description}</p>
          <p className="mt-1 text-sm text-neutral-600">
            Condition on receipt: {snap.condition.toLowerCase().replace("_", " ")}
          </p>

          {snap.lines.length > 0 ? (
            <div className="relative overflow-x-auto print:overflow-visible">
              <table className="mt-5 w-full text-sm">
                <thead>
                  <tr className="border-y text-[10px] uppercase tracking-widest text-neutral-500">
                    <th className="py-2 text-left font-semibold">Line</th>
                    <th className="py-2 text-left font-semibold">Type</th>
                    <th className="py-2 text-right font-semibold">Qty</th>
                    <th className="py-2 text-right font-semibold">L × W × H</th>
                    <th className="py-2 text-right font-semibold">CBM</th>
                    <th className="py-2 text-right font-semibold">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.lines.map((l) => (
                    <tr key={l.reference} className="border-b">
                      <td className="tnum py-2">{l.reference}</td>
                      <td className="py-2">
                        {l.type.charAt(0) + l.type.slice(1).toLowerCase()}
                        {l.balerNumber ? (
                          <span className="block text-xs text-neutral-500">
                            Bale {l.balerNumber}
                          </span>
                        ) : null}
                      </td>
                      <td className="tnum py-2 text-right">{l.quantity}</td>
                      <td className="tnum py-2 text-right text-neutral-600">
                        {l.length && l.width && l.height
                          ? `${l.length} × ${l.width} × ${l.height} ${l.unit.toLowerCase()}`
                          : "—"}
                      </td>
                      <td className="tnum py-2 text-right">
                        {Number(l.cbm).toFixed(3)}
                      </td>
                      <td className="tnum py-2 text-right text-neutral-600">
                        {l.weightKg ? `${Number(l.weightKg).toFixed(2)} kg` : "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td colSpan={4} className="py-2">
                      Total
                    </td>
                    <td className="tnum py-2 text-right">
                      {Number(snap.cbm).toFixed(3)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <footer className="grid grid-cols-1 gap-6 border-t pt-6 text-xs text-neutral-600 sm:grid-cols-2">
          <div>
            <p>
              Issued by {note.issuedBy?.name ?? "Swift Cargo"} on{" "}
              {formatDateTime(note.issuedAt)}.
            </p>
            <p className="mt-2">
              This note records what Swift Cargo received. Final charges are based
              on warehouse measurements and the applicable rate.
            </p>
          </div>
          <div className="sm:text-right">
            {company?.chinaAddress ? <p>{company.chinaAddress}</p> : null}
            {company?.darAddress ? (
              <p className="mt-1">{company.darAddress}</p>
            ) : null}
            {company?.phone ? (
              <p className="tnum mt-1">
                {company.phone}
                {company.altPhone ? ` · ${company.altPhone}` : ""}
              </p>
            ) : null}
          </div>
        </footer>
      </article>
    </div>
  );
}
