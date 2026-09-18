import Image from "next/image";
import type { CompanySetting } from "@prisma/client";

import { PrintButton } from "@/components/app/print-button";
import { SmartBack } from "@/components/app/smart-back";
import { formatDate } from "@/lib/format";
import type { PackingSnapshot } from "@/lib/packing-list";

/**
 * THE PACKING LIST, AS PRINTED.
 *
 * Laid out after the Guangzhou "PACKING LIST & INVOICE" sheet the business has
 * always sent with a container, so nobody reading it at a port or a clearing
 * agent's desk has to learn a new document — with a letterhead, the parties,
 * the shipment and a total for every column.
 */
export function PackingListSheet({
  snap,
  list,
  company,
  containerId: id,
}: {
  snap: PackingSnapshot;
  list: { number: string; issuedAt: Date; issuedBy: string | null } | null;
  company: CompanySetting | null;
  containerId: string;
}) {
  /*
    ONE BLOCK PER CUSTOMER, IN THE ORDER THEY WERE LOADED.

    The layout of the paper list Guangzhou has always sent: the customer's
    name once, down the side of their rows, then every kind of goods on its
    own row — English and Chinese names, model, packages, pieces, unit price,
    amount, CBM, gross and net weight, shipping mark and the carbon-book
    ("inquiry") number — and a subtotal under each customer. A mixed container
    is read by somebody looking for one name, so the name leads.
  */
  type Row = {
    key: string;
    cargoRef: string;
    inquiry: string | null;
    mark: string | null;
    en: string;
    zh: string | null;
    bale: string | null;
    model: string | null;
    qty: number;
    pcs: number | null;
    unit: number | null;
    amount: number | null;
    cbm: number;
    gw: number | null;
    nw: number | null;
  };
  const num = (v: string | null | undefined) => (v == null || v === "" ? null : Number(v));

  const groups = Object.values(
    snap.lines.reduce<
      Record<string, { code: string; customer: string; phone: string; rows: Row[] }>
    >((acc, line) => {
      const group = (acc[line.customerCode] ??= {
        code: line.customerCode,
        customer: line.customer,
        phone: line.phone,
        rows: [],
      });
      if (line.items && line.items.length > 0) {
        for (const item of line.items) {
          group.rows.push({
            key: item.reference,
            cargoRef: line.cargoReference,
            inquiry: item.paperReceiptNo ?? line.paperReceiptNo,
            mark: line.shippingMark,
            en: item.description ?? line.description,
            zh: item.descriptionZh,
            bale: item.balerNumber,
            model: item.modelNo ?? null,
            qty: item.quantity,
            pcs: item.pieces,
            unit: num(item.unitValue),
            amount: num(item.amount),
            cbm: Number(item.cbm),
            gw: num(item.weightKg),
            nw: num(item.netWeightKg),
          });
        }
      } else {
        group.rows.push({
          key: line.cargoReference,
          cargoRef: line.cargoReference,
          inquiry: line.paperReceiptNo,
          mark: line.shippingMark,
          en: line.description,
          zh: null,
          bale: null,
          model: null,
          qty: line.packages,
          pcs: line.pieces,
          unit: null,
          amount: null,
          cbm: Number(line.cbm),
          gw: num(line.weightKg),
          nw: null,
        });
      }
      return acc;
    }, {})
  );

  const sum = (rows: Row[], pick: (r: Row) => number | null) => {
    const values = rows.map(pick).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const all = groups.flatMap((g) => g.rows);
  const totals = {
    qty: sum(all, (r) => r.qty) ?? 0,
    pcs: sum(all, (r) => r.pcs),
    amount: sum(all, (r) => r.amount),
    cbm: sum(all, (r) => r.cbm) ?? 0,
    gw: sum(all, (r) => r.gw),
    nw: sum(all, (r) => r.nw),
  };

  const n = (v: number | null, digits = 0) =>
    v === null
      ? "—"
      : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const usd = (v: number | null) => (v === null ? "—" : n(v, 2));
  const kg = (v: number | null) => (v === null ? "—" : n(v, 2));

  const shipper = company?.chinaEntity || company?.name || "Swift Cargo";
  const consignee = company?.darEntity || company?.name || "Swift Cargo";

  const th = "px-2 py-2 text-[9px] font-bold uppercase tracking-wider";

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      {/* The sheet prints the way the paper one always has: A4 across. */}
      <style>{`@page { size: A4 landscape; margin: 9mm; } @media print { .pl-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/containers/${id}`} fallbackLabel={`${snap.container}`} />
        <PrintButton label={list ? "Download / print" : "Download / print provisional"} />
      </div>

      <article className="pl-sheet overflow-hidden rounded-2xl border bg-white text-[#0b1b2b] shadow-raised print:rounded-none print:border-0 print:shadow-none">
        {/* ------------------------------------------------------ Letterhead */}
        <header className="relative overflow-hidden bg-[#0b2742] px-8 py-6 text-white">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_-20%,rgba(79,201,240,0.35),transparent_60%),radial-gradient(ellipse_at_0%_120%,rgba(244,97,31,0.3),transparent_55%)]"
          />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <span className="grid size-16 place-items-center rounded-2xl bg-white p-1.5">
                <Image src="/brand/swift-cargo.png" alt="" width={56} height={56} className="object-contain" />
              </span>
              <div>
                <p className="text-2xl font-extrabold uppercase tracking-[0.12em]">
                  {company?.name ?? "Swift Cargo"}
                </p>
                {company?.tagline ? <p className="text-xs text-white/70">{company.tagline}</p> : null}
                {company?.chinaAddress ? (
                  <p className="mt-1 max-w-xl text-[11px] leading-snug text-white/80">{company.chinaAddress}</p>
                ) : null}
                {company?.phone || company?.email ? (
                  <p className="text-[11px] text-white/70">
                    {[company?.phone, company?.altPhone, company?.email].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#ffb27d]">Packing list &amp; invoice</p>
              <p className="tnum mt-1 text-3xl font-extrabold tracking-tight">{list ? list.number : "PROVISIONAL"}</p>
              <p className="text-xs text-white/75">
                {list ? `Date ${formatDate(list.issuedAt)}` : "Updates as cargo is loaded"}
                {snap.version > 1 ? ` · drawing ${snap.version}` : ""}
              </p>
            </div>
          </div>
          <div className="relative mt-5 h-1 rounded-full bg-gradient-to-r from-[#f4611f] via-[#ffb27d] to-[#4fc9f0]" />
        </header>

        <div className="px-8 py-6">
          {/* ------------------------------------------------------ Parties */}
          <section className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["Shipper", shipper, company?.chinaAddress],
                ["Consignee (To)", consignee, company?.darAddress],
                ["Route", `${snap.originPort ?? "Guangzhou"} → ${snap.destinationPort ?? "Dar es Salaam"}`, snap.originWarehouse ? `Loaded at ${snap.originWarehouse}` : null],
              ] as const
            ).map(([label, name, detail]) => (
              <div key={label} className="rounded-xl border border-[#d6e2ee] bg-[#f5f9fc] px-4 py-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#f4611f]">{label}</p>
                <p className="mt-1 text-sm font-bold uppercase">{name}</p>
                {detail ? <p className="mt-0.5 text-[11px] leading-snug text-neutral-600">{detail}</p> : null}
              </div>
            ))}
          </section>

          {/* ---------------------------------------------- The shipment */}
          <section className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#d6e2ee] bg-[#d6e2ee] sm:grid-cols-5">
            {[
              ["Container no.", snap.container],
              ["Seal no.", snap.sealNumber ?? "—"],
              ["Vessel / voyage", snap.vessel ? `${snap.vessel}${snap.voyage ? ` / ${snap.voyage}` : ""}` : "—"],
              ["Shipping line", snap.shippingLine ?? "—"],
              ["Our reference", snap.reference],
              ["Port of loading", snap.originPort ?? "—"],
              ["Port of discharge", snap.destinationPort ?? "—"],
              ["Packed", snap.packedAt ? formatDate(new Date(snap.packedAt)) : "—"],
              ["Sailed", snap.shippedAt ? formatDate(new Date(snap.shippedAt)) : "—"],
              ["ETA", snap.eta ? formatDate(new Date(snap.eta)) : "—"],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-neutral-500">{label}</p>
                <p className="tnum mt-0.5 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </section>

          {/* ---------------------------------------------- At a glance */}
          <section className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-7">
            {[
              ["Customers", n(groups.length)],
              ["Consignments", n(snap.lines.length)],
              ["Packages", n(totals.qty)],
              ["Pieces", n(totals.pcs)],
              ["Volume", `${n(totals.cbm, 3)} CBM`],
              ["Gross weight", totals.gw === null ? "—" : `${kg(totals.gw)} kg`],
              ["Declared value", totals.amount === null ? "—" : `USD ${usd(totals.amount)}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-[#0b2742] px-3 py-2.5 text-white">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#9fd8f5]">{label}</p>
                <p className="tnum mt-0.5 text-base font-extrabold">{value}</p>
              </div>
            ))}
          </section>

          {/* ---------------------------------------------- The goods */}
          <div className="mt-6 overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[1040px] border-collapse text-[11px] print:min-w-0">
              <thead>
                <tr className="bg-[#0b2742] text-left text-white">
                  <th className={`${th} w-[13%]`}>Customer name</th>
                  <th className={th}>Inquiry no.</th>
                  <th className={`${th} w-[18%]`}>Description · 品名</th>
                  <th className={th}>Model no.</th>
                  <th className={`${th} text-right`}>Qty</th>
                  <th className={`${th} text-right`}>Pcs / set</th>
                  <th className={`${th} text-right`}>Unit price USD</th>
                  <th className={`${th} text-right`}>Amount USD</th>
                  <th className={`${th} text-right`}>CBM</th>
                  <th className={`${th} text-right`}>G.W. kg</th>
                  <th className={`${th} text-right`}>N.W. kg</th>
                  <th className={th}>Shipping mark</th>
                </tr>
              </thead>
              {groups.map((group, gi) => {
                const sub = {
                  qty: sum(group.rows, (r) => r.qty) ?? 0,
                  pcs: sum(group.rows, (r) => r.pcs),
                  amount: sum(group.rows, (r) => r.amount),
                  cbm: sum(group.rows, (r) => r.cbm) ?? 0,
                  gw: sum(group.rows, (r) => r.gw),
                  nw: sum(group.rows, (r) => r.nw),
                };
                return (
                  <tbody key={group.code} className="break-inside-avoid">
                    {group.rows.map((row, ri) => (
                      <tr key={row.key} className={ri % 2 ? "bg-[#f7fafc]" : "bg-white"}>
                        {ri === 0 ? (
                          <td rowSpan={group.rows.length} className="border-b border-r border-[#d6e2ee] bg-white px-2 py-2 align-top">
                            <span className="grid size-5 place-items-center rounded-full bg-[#f4611f] text-[9px] font-bold text-white">
                              {gi + 1}
                            </span>
                            <p className="mt-1 text-xs font-extrabold uppercase leading-tight">{group.customer}</p>
                            <p className="tnum mt-0.5 text-[10px] text-neutral-500">{group.code}</p>
                            <p className="tnum text-[10px] text-neutral-500">{group.phone}</p>
                          </td>
                        ) : null}
                        <td className="tnum border-b border-[#e6edf3] px-2 py-1.5 align-top">
                          <span className="font-semibold">{row.inquiry ?? "—"}</span>
                          <span className="block text-[9px] text-neutral-400">{row.cargoRef}</span>
                        </td>
                        <td className="border-b border-[#e6edf3] px-2 py-1.5 align-top">
                          <span className="font-semibold uppercase">{row.en}</span>
                          {row.zh ? <span className="block text-neutral-500">{row.zh}</span> : null}
                          {row.bale ? <span className="tnum block text-[9px] text-neutral-400">Bale {row.bale}</span> : null}
                        </td>
                        <td className="border-b border-[#e6edf3] px-2 py-1.5 align-top text-neutral-600">{row.model ?? "—"}</td>
                        <td className="tnum border-b border-[#e6edf3] px-2 py-1.5 text-right align-top font-semibold">{n(row.qty)}</td>
                        <td className="tnum border-b border-[#e6edf3] px-2 py-1.5 text-right align-top">{n(row.pcs)}</td>
                        <td className="tnum border-b border-[#e6edf3] px-2 py-1.5 text-right align-top">{usd(row.unit)}</td>
                        <td className="tnum border-b border-[#e6edf3] px-2 py-1.5 text-right align-top font-semibold">{usd(row.amount)}</td>
                        <td className="tnum border-b border-[#e6edf3] px-2 py-1.5 text-right align-top font-semibold">
                          {row.cbm > 0 ? n(row.cbm, 3) : <span className="text-[9px] text-neutral-400">with above</span>}
                        </td>
                        <td className="tnum border-b border-[#e6edf3] px-2 py-1.5 text-right align-top">{kg(row.gw)}</td>
                        <td className="tnum border-b border-[#e6edf3] px-2 py-1.5 text-right align-top">{kg(row.nw)}</td>
                        <td className="border-b border-[#e6edf3] px-2 py-1.5 align-top font-mono text-[10px] uppercase text-neutral-600">
                          {row.mark ?? group.customer}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[#fff2ea] font-bold">
                      <td className="border-b-2 border-[#f4c7a9] px-2 py-1.5 text-[10px] uppercase tracking-wider text-[#b3440f]" colSpan={4}>
                        Subtotal · {group.customer}
                      </td>
                      <td className="tnum border-b-2 border-[#f4c7a9] px-2 py-1.5 text-right">{n(sub.qty)}</td>
                      <td className="tnum border-b-2 border-[#f4c7a9] px-2 py-1.5 text-right">{n(sub.pcs)}</td>
                      <td className="border-b-2 border-[#f4c7a9]" />
                      <td className="tnum border-b-2 border-[#f4c7a9] px-2 py-1.5 text-right">{usd(sub.amount)}</td>
                      <td className="tnum border-b-2 border-[#f4c7a9] px-2 py-1.5 text-right">{n(sub.cbm, 3)}</td>
                      <td className="tnum border-b-2 border-[#f4c7a9] px-2 py-1.5 text-right">{kg(sub.gw)}</td>
                      <td className="tnum border-b-2 border-[#f4c7a9] px-2 py-1.5 text-right">{kg(sub.nw)}</td>
                      <td className="border-b-2 border-[#f4c7a9]" />
                    </tr>
                  </tbody>
                );
              })}
              <tfoot>
                <tr className="bg-[#0b2742] font-extrabold text-white">
                  <td className="px-2 py-2.5 text-[10px] uppercase tracking-wider" colSpan={4}>
                    Grand total · {groups.length} customer{groups.length === 1 ? "" : "s"} · {snap.lines.length} consignment
                    {snap.lines.length === 1 ? "" : "s"}
                  </td>
                  <td className="tnum px-2 py-2.5 text-right">{n(totals.qty)}</td>
                  <td className="tnum px-2 py-2.5 text-right">{n(totals.pcs)}</td>
                  <td />
                  <td className="tnum px-2 py-2.5 text-right">{usd(totals.amount)}</td>
                  <td className="tnum px-2 py-2.5 text-right text-[#ffb27d]">{n(totals.cbm, 3)}</td>
                  <td className="tnum px-2 py-2.5 text-right">{kg(totals.gw)}</td>
                  <td className="tnum px-2 py-2.5 text-right">{kg(totals.nw)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ---------------------------------------------- Signatures */}
          <section className="mt-8 grid gap-6 sm:grid-cols-3">
            {["Prepared by (Guangzhou)", "Checked by", "Received at Dar es Salaam"].map((label) => (
              <div key={label}>
                <div className="h-12 border-b border-dashed border-neutral-400" />
                <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">{label}</p>
                <p className="text-[10px] text-neutral-400">Name · signature · date</p>
              </div>
            ))}
          </section>

          <footer className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-[#d6e2ee] pt-4 text-[10px] text-neutral-500">
            <p className="max-w-2xl">
              {list
                ? `Issued by ${snap.issuedBy ?? list.issuedBy ?? "Swift Cargo"} on ${formatDate(
                    snap.issuedAt ? new Date(snap.issuedAt) : list.issuedAt
                  )}${snap.version > 1 ? ` · drawing ${snap.version}, frozen at the seal` : ""}.`
                : "Not yet issued. Drawn from what is in the container right now; it changes as cargo is loaded or taken out, and is frozen when the container is sealed."}{" "}
              Unit price and amount are the declared value of the goods for customs, in US dollars — not the freight charge.
            </p>
            <p className="font-bold uppercase tracking-[0.2em] text-[#0b2742]">
              {company?.name ?? "Swift Cargo"} · {company?.tagline ?? "On time, every time"}
            </p>
          </footer>
        </div>
      </article>
    </div>
  );
}
