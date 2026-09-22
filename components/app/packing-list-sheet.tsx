import Image from "next/image";
import type { CompanySetting } from "@prisma/client";

import { AutoPrint, DownloadSheetButton, PrintButton } from "@/components/app/print-button";
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

  const th = "px-1.5 py-1.5 text-[7.5px] font-bold uppercase tracking-wider";
  const td = "border-b border-[#e3eaf1] px-1.5 py-[3px] align-top leading-tight";

  return (
    <div className="mx-auto max-w-[860px] space-y-6 print:max-w-none print:space-y-0">
      {/*
        A4 PORTRAIT, EDGE TO EDGE.

        The page has no margin of its own, so the browser has nowhere to print
        its date and address across the top and bottom; the sheet carries its
        own 10mm instead. The table's heading repeats on every page and a row
        never splits across two.
      */}
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .pl-sheet { width: 210mm; padding: 10mm 10mm 12mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .pl-sheet thead { display: table-header-group; }
          .pl-sheet tr { break-inside: avoid; }
          .update-pill { display: none !important; }
        }
      `}</style>

      <AutoPrint />
      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/containers/${id}`} fallbackLabel={`${snap.container}`} />
        <span className="flex items-center gap-2">
          <DownloadSheetButton label="Download PDF" />
          <PrintButton label="Print" />
        </span>
      </div>

      <article className="pl-sheet mx-auto bg-white p-[10mm] text-[#0b1b2b] shadow-raised ring-1 ring-black/5 print:shadow-none print:ring-0">
        {/* ------------------------------------------------------ Letterhead */}
        <header className="flex items-start justify-between gap-4 border-b-[3px] border-[#0b2742] pb-3">
          <div className="flex items-center gap-3">
            <Image src="/brand/swift-cargo.png" alt="" width={58} height={58} className="object-contain" />
            <div>
              <p className="text-[19px] font-extrabold uppercase leading-none tracking-[0.1em] text-[#0b2742]">
                {company?.name ?? "Swift Cargo"}
              </p>
              <p className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-[0.2em] text-[#f4611f]">
                {company?.tagline ?? "On time, every time"}
              </p>
              {company?.chinaAddress ? (
                <p className="mt-1 max-w-[95mm] text-[8px] leading-snug text-neutral-600">{company.chinaAddress}</p>
              ) : null}
              {company?.phone || company?.email ? (
                <p className="text-[8px] text-neutral-600">
                  {[company?.phone, company?.altPhone, company?.email].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[17px] font-extrabold uppercase leading-none tracking-tight text-[#0b2742]">
              Packing list
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#f4611f]">&amp; invoice</p>
            <p className="tnum mt-1.5 text-[13px] font-bold">{list ? list.number : "PROVISIONAL"}</p>
            <p className="text-[8px] text-neutral-500">
              {list ? `Date ${formatDate(list.issuedAt)}` : "Updates as cargo is loaded"}
              {snap.version > 1 ? ` · drawing ${snap.version}` : ""}
            </p>
          </div>
        </header>

        {/* ------------------------------------------------------ Parties */}
        <section className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              ["Shipper", shipper, company?.chinaAddress],
              ["Consignee (To)", consignee, company?.darAddress],
            ] as const
          ).map(([label, name, detail]) => (
            <div key={label} className="rounded-md border border-[#d6e2ee] bg-[#f5f9fc] px-3 py-2">
              <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-[#f4611f]">{label}</p>
              <p className="mt-0.5 text-[9.5px] font-bold uppercase leading-tight">{name}</p>
              {detail ? <p className="mt-0.5 text-[8px] leading-snug text-neutral-600">{detail}</p> : null}
            </div>
          ))}
        </section>

        {/* ---------------------------------------------- The shipment */}
        <section className="mt-2 grid grid-cols-5 overflow-hidden rounded-md border border-[#d6e2ee]">
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
          ].map(([label, value], i) => (
            <div
              key={label}
              className={`px-2 py-1.5 ${i % 5 !== 4 ? "border-r" : ""} ${i < 5 ? "border-b" : ""} border-[#d6e2ee]`}
            >
              <p className="text-[6.5px] font-bold uppercase tracking-[0.16em] text-neutral-500">{label}</p>
              <p className="tnum text-[9px] font-semibold leading-tight">{value}</p>
            </div>
          ))}
        </section>

        {/* ---------------------------------------------- At a glance */}
        <section className="mt-2 grid grid-cols-7 overflow-hidden rounded-md bg-[#0b2742] text-white">
          {[
            ["Customers", n(groups.length)],
            ["Consignments", n(snap.lines.length)],
            ["Packages", n(totals.qty)],
            ["Pieces", n(totals.pcs)],
            ["Volume CBM", n(totals.cbm, 3)],
            ["Gross kg", kg(totals.gw)],
            ["Value USD", usd(totals.amount)],
          ].map(([label, value], i) => (
            <div key={label} className={`px-2 py-1.5 ${i < 6 ? "border-r border-white/15" : ""}`}>
              <p className="text-[6.5px] font-bold uppercase tracking-[0.14em] text-[#9fd8f5]">{label}</p>
              <p className="tnum text-[11px] font-extrabold">{value}</p>
            </div>
          ))}
        </section>

        {/* ---------------------------------------------- The goods */}
        <table className="mt-2.5 w-full border-collapse text-[8.5px]">
          <colgroup>
            <col className="w-[17%]" />
            <col className="w-[9%]" />
            <col className="w-[20%]" />
            <col className="w-[8%]" />
            <col className="w-[5%]" />
            <col className="w-[6%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[6.5%]" />
            <col className="w-[6.5%]" />
          </colgroup>
          <thead>
            <tr className="bg-[#0b2742] text-left text-white">
              <th className={th}>Customer</th>
              <th className={th}>Inquiry no.</th>
              <th className={th}>Description · 品名</th>
              <th className={th}>Model</th>
              <th className={`${th} text-right`}>Qty</th>
              <th className={`${th} text-right`}>Pcs/set</th>
              <th className={`${th} text-right`}>Unit USD</th>
              <th className={`${th} text-right`}>Amount USD</th>
              <th className={`${th} text-right`}>CBM</th>
              <th className={`${th} text-right`}>G.W. kg</th>
              <th className={`${th} text-right`}>N.W. kg</th>
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
            const groupMark = group.rows[0]?.mark ?? group.customer;
            return (
              <tbody key={group.code}>
                {group.rows.map((row, ri) => (
                  <tr key={row.key} className={ri % 2 ? "bg-[#f7fafc]" : "bg-white"}>
                    {ri === 0 ? (
                      <td rowSpan={group.rows.length} className={`${td} border-r bg-white`}>
                        <p className="flex items-start gap-1 font-extrabold uppercase leading-tight">
                          <span className="tnum mt-px grid size-3.5 shrink-0 place-items-center rounded-full bg-[#f4611f] text-[6.5px] text-white">
                            {gi + 1}
                          </span>
                          {group.customer}
                        </p>
                        <p className="tnum text-[7.5px] text-neutral-500">
                          {group.code} · {group.phone}
                        </p>
                        {/* The mark only when it says something the name does not. */}
                        {groupMark.trim().toLowerCase() !== group.customer.trim().toLowerCase() ? (
                          <p className="font-mono text-[7.5px] uppercase text-[#0b2742]">Mark: {groupMark}</p>
                        ) : null}
                      </td>
                    ) : null}
                    <td className={`${td} tnum`}>
                      <span className="font-semibold">{row.inquiry ?? "—"}</span>
                      <span className="block text-[7px] text-neutral-400">{row.cargoRef}</span>
                    </td>
                    <td className={td}>
                      <span className="font-semibold uppercase">{row.en}</span>
                      {row.zh ? <span className="block text-neutral-500">{row.zh}</span> : null}
                      {row.mark && row.mark !== groupMark ? (
                        <span className="block font-mono text-[7px] uppercase text-neutral-500">Mark: {row.mark}</span>
                      ) : null}
                      {row.bale ? <span className="tnum block text-[7px] text-neutral-400">Bale {row.bale}</span> : null}
                    </td>
                    <td className={`${td} text-neutral-600`}>{row.model ?? "—"}</td>
                    <td className={`${td} tnum text-right font-semibold`}>{n(row.qty)}</td>
                    <td className={`${td} tnum text-right`}>{n(row.pcs)}</td>
                    <td className={`${td} tnum text-right`}>{usd(row.unit)}</td>
                    <td className={`${td} tnum text-right font-semibold`}>{usd(row.amount)}</td>
                    <td className={`${td} tnum text-right font-semibold`}>
                      {row.cbm > 0 ? n(row.cbm, 3) : <span className="text-[7px] text-neutral-400">with above</span>}
                    </td>
                    <td className={`${td} tnum text-right`}>{kg(row.gw)}</td>
                    <td className={`${td} tnum text-right`}>{kg(row.nw)}</td>
                  </tr>
                ))}
                <tr className="bg-[#fff2ea] font-bold">
                  <td className="border-b-2 border-[#f4c7a9] px-1.5 py-1 text-[7.5px] uppercase tracking-wider text-[#b3440f]" colSpan={4}>
                    Subtotal · {group.customer}
                  </td>
                  <td className="tnum border-b-2 border-[#f4c7a9] px-1.5 py-1 text-right">{n(sub.qty)}</td>
                  <td className="tnum border-b-2 border-[#f4c7a9] px-1.5 py-1 text-right">{n(sub.pcs)}</td>
                  <td className="border-b-2 border-[#f4c7a9]" />
                  <td className="tnum border-b-2 border-[#f4c7a9] px-1.5 py-1 text-right">{usd(sub.amount)}</td>
                  <td className="tnum border-b-2 border-[#f4c7a9] px-1.5 py-1 text-right">{n(sub.cbm, 3)}</td>
                  <td className="tnum border-b-2 border-[#f4c7a9] px-1.5 py-1 text-right">{kg(sub.gw)}</td>
                  <td className="tnum border-b-2 border-[#f4c7a9] px-1.5 py-1 text-right">{kg(sub.nw)}</td>
                </tr>
              </tbody>
            );
          })}
          <tbody>
            <tr className="bg-[#0b2742] font-extrabold text-white">
              <td className="px-1.5 py-1.5 text-[7.5px] uppercase tracking-wider" colSpan={4}>
                Grand total · {groups.length} customer{groups.length === 1 ? "" : "s"} · {snap.lines.length} consignment
                {snap.lines.length === 1 ? "" : "s"}
              </td>
              <td className="tnum px-1.5 py-1.5 text-right">{n(totals.qty)}</td>
              <td className="tnum px-1.5 py-1.5 text-right">{n(totals.pcs)}</td>
              <td />
              <td className="tnum px-1.5 py-1.5 text-right">{usd(totals.amount)}</td>
              <td className="tnum px-1.5 py-1.5 text-right text-[#ffb27d]">{n(totals.cbm, 3)}</td>
              <td className="tnum px-1.5 py-1.5 text-right">{kg(totals.gw)}</td>
              <td className="tnum px-1.5 py-1.5 text-right">{kg(totals.nw)}</td>
            </tr>
          </tbody>
        </table>

        {/* ---------------------------------------------- Signatures */}
        <section className="mt-4 break-inside-avoid">
          <div className="grid grid-cols-3 gap-5">
            {["Prepared by (Guangzhou)", "Checked by", "Received at Dar es Salaam"].map((label) => (
              <div key={label}>
                <div className="h-7 border-b border-dashed border-neutral-400" />
                <p className="mt-1 text-[7px] font-bold uppercase tracking-[0.16em] text-neutral-600">{label}</p>
                <p className="text-[7px] text-neutral-400">Name · signature · date</p>
              </div>
            ))}
          </div>
          <footer className="mt-4 flex items-end justify-between gap-4 border-t border-[#d6e2ee] pt-2 text-[7px] text-neutral-500">
            <p className="max-w-[140mm]">
              {list
                ? `Issued by ${snap.issuedBy ?? list.issuedBy ?? "Swift Cargo"} on ${formatDate(
                    snap.issuedAt ? new Date(snap.issuedAt) : list.issuedAt
                  )}${snap.version > 1 ? ` · drawing ${snap.version}, frozen at the seal` : ""}.`
                : "Not yet issued — drawn from what is in the container now, and frozen when it is sealed."}{" "}
              Unit price and amount are the declared value of the goods for customs, in US dollars — not the freight charge.
            </p>
            <p className="shrink-0 font-bold uppercase tracking-[0.18em] text-[#0b2742]">
              {company?.name ?? "Swift Cargo"}
            </p>
          </footer>
        </section>
      </article>
    </div>
  );
}
