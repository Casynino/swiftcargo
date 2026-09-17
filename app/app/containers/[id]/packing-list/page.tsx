import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PrintButton } from "@/components/app/print-button";
import { formatDate } from "@/lib/format";
import { buildSnapshot, type PackingSnapshot } from "@/lib/packing-list";
import { LOADABLE_CONTAINER_STATUSES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";

/* The saved file is named after the page, so the container's own number goes in
   the title — a downloads folder full of "packing-list.pdf" tells nobody which
   sailing they are holding. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const container = await prisma.container.findUnique({
    where: { id },
    select: { reference: true },
  });
  return {
    title: {
      absolute: container
        ? `Packing list ${container.reference}`
        : "Packing list",
    },
  };
}


/**
 * The manifest, as printed.
 *
 * One container, many customers, one line each — the document that goes to the
 * shipping line and to customs, and the one Dar checks the boxes off against.
 * Rendered from the snapshot rather than the live rows for the same reason as
 * the delivery note.
 */
export default async function PackingListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("packingList.view");
  const { id } = await params;

  const [list, company, box] = await Promise.all([
    prisma.packingList.findUnique({
      where: { containerId: id },
      include: { issuedBy: { select: { name: true } } },
    }),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    prisma.container.findUnique({ where: { id }, select: { status: true } }),
  ]);
  /* A number handed out early does not freeze the box. Until the seal the
     sheet is still what is loaded right now. */
  const stillOpen = !!box && LOADABLE_CONTAINER_STATUSES.includes(box.status);

  /*
    ISSUED OR NOT, THERE IS ALWAYS A LIST.

    Before the container is sealed this is drawn live from what is loaded, so
    the sheet a clerk prints mid-load is what is actually in the box at that
    moment. Sealing freezes it, and from then on the frozen copy is what prints
    — the paper somebody is holding at a port cannot be rewritten by a later
    correction.
  */
  const snap = (list && !stillOpen
    ? (list.snapshot as unknown as PackingSnapshot)
    : await buildSnapshot(prisma, id)) as PackingSnapshot | null;
  if (!snap) notFound();

  /*
    ONE BLOCK PER CUSTOMER, IN THE ORDER THEY WERE LOADED.

    A mixed container is somebody's twelve cartons sitting beside somebody
    else's machine, and the sheet is read by a person looking for one name. The
    subtotal under each block is the figure that customer is charged against and
    the one they will ask about; loose rows in loading order make everyone add
    up their own.
  */
  const groups = Object.values(
    snap.lines.reduce<
      Record<
        string,
        {
          code: string;
          customer: string;
          phone: string;
          mark: string | null;
          lines: PackingSnapshot["lines"];
          packages: number;
          cbm: number;
        }
      >
    >((acc, line) => {
      const group = (acc[line.customerCode] ??= {
        code: line.customerCode,
        customer: line.customer,
        phone: line.phone,
        mark: line.shippingMark,
        lines: [],
        packages: 0,
        cbm: 0,
      });
      group.lines.push(line);
      /* Count what is printed above the subtotal. The consignment carries its
         own package count from the loading bay, but the rows a reader adds up
         are the item rows, and a subtotal that disagrees with the column above
         it is the first thing anyone queries. */
      group.packages += line.items?.length
        ? line.items.reduce((sum, item) => sum + item.quantity, 0)
        : line.packages;
      group.cbm += Number(line.cbm);
      return acc;
    }, {})
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/containers/${id}`} fallbackLabel={`${snap.container}`} />
        <PrintButton
          label={list ? "Download / print" : "Download / print provisional"}
        />
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
                {snap.originPort} → {snap.destinationPort}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide">
              Packing List
            </p>
            <p className="tnum text-lg font-bold">
              {list ? list.number : "Provisional"}
            </p>
            <p className="text-xs text-neutral-500">
              {list ? formatDate(list.issuedAt) : "Updates as cargo is loaded"}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-x-6 gap-y-4 border-b py-6 text-sm sm:grid-cols-4">
          {[
            ["Container", snap.container],
            ["Seal", snap.sealNumber ?? "—"],
            ["Shipping line", snap.shippingLine ?? "—"],
            ["Vessel / voyage",
              snap.vessel ? `${snap.vessel}${snap.voyage ? ` / ${snap.voyage}` : ""}` : "—"],
            ["Consignments", String(snap.lines.length)],
            ["Customers", String(snap.totalCustomers)],
            ["Total volume", `${Number(snap.totalCbm).toFixed(3)} m³`],
            ["Our reference", snap.reference],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                {label}
              </p>
              <p className="tnum mt-0.5 font-medium">{value}</p>
            </div>
          ))}
        </section>

        {groups.map((group, groupIndex) => (
          <section key={group.code} className="mt-6 break-inside-avoid">
            <div className="flex items-end justify-between border-b-2 border-neutral-800 pb-1">
              <p className="text-sm font-bold uppercase tracking-wide">
                {groupIndex + 1}. {group.customer}
                {/* The mark only when it says something the name does not —
                    a customer registered at the counter is marked with their
                    own name, and printing both twice is noise on a document
                    somebody reads at a port. */}
                {group.mark &&
                group.mark.trim().toLowerCase() !==
                  group.customer.trim().toLowerCase() ? (
                  <span className="ml-2 font-mono text-xs font-normal text-neutral-500">
                    {group.mark}
                  </span>
                ) : null}
              </p>
              <p className="tnum text-xs text-neutral-500">
                {group.code} · {group.phone}
              </p>
            </div>

            <div className="relative overflow-x-auto print:overflow-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-[10px] uppercase tracking-widest text-neutral-500">
                    <th className="py-1.5 text-left font-semibold">Cargo ref</th>
                    <th className="py-1.5 text-left font-semibold">Goods</th>
                    <th className="py-1.5 text-left font-semibold">Cargo type</th>
                    <th className="py-1.5 text-right font-semibold">Pkgs</th>
                    <th className="py-1.5 text-right font-semibold">Pcs</th>
                    <th className="py-1.5 text-right font-semibold">Weight</th>
                    <th className="py-1.5 text-right font-semibold">CBM</th>
                  </tr>
                </thead>
                <tbody>
                  {group.lines.flatMap((line) =>
                    line.items && line.items.length > 0
                      ? line.items.map((item, itemIndex) => (
                          <tr key={item.reference} className="border-b">
                            <td className="tnum py-1.5 align-top">
                              {itemIndex === 0 ? line.cargoReference : ""}
                            </td>
                            <td className="py-1.5">
                              {item.description ?? line.description}
                              {item.descriptionZh ? (
                                <span className="block text-xs text-neutral-500">
                                  {item.descriptionZh}
                                </span>
                              ) : null}
                              {item.balerNumber ? (
                                <span className="tnum block text-xs text-neutral-500">
                                  Bale {item.balerNumber}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-1.5 text-neutral-600">
                              {item.cargoType ?? "—"}
                            </td>
                            <td className="tnum py-1.5 text-right">
                              {item.quantity}
                            </td>
                            <td className="tnum py-1.5 text-right text-neutral-600">
                              {item.pieces ?? "—"}
                            </td>
                            <td className="tnum py-1.5 text-right text-neutral-600">
                              {item.weightKg
                                ? `${Number(item.weightKg).toFixed(2)} kg`
                                : "—"}
                            </td>
                            <td className="tnum py-1.5 text-right font-medium">
                              {Number(item.cbm).toFixed(3)}
                            </td>
                          </tr>
                        ))
                      : [
                          <tr key={line.cargoReference} className="border-b">
                            <td className="tnum py-1.5">{line.cargoReference}</td>
                            <td className="py-1.5">{line.description}</td>
                            <td className="py-1.5 text-neutral-600">—</td>
                            <td className="tnum py-1.5 text-right">
                              {line.packages}
                            </td>
                            <td className="tnum py-1.5 text-right text-neutral-600">
                              —
                            </td>
                            <td className="tnum py-1.5 text-right text-neutral-600">
                              {line.weightKg
                                ? `${Number(line.weightKg).toFixed(2)} kg`
                                : "—"}
                            </td>
                            <td className="tnum py-1.5 text-right font-medium">
                              {Number(line.cbm).toFixed(3)}
                            </td>
                          </tr>,
                        ]
                  )}
                  <tr className="font-semibold">
                    <td colSpan={3} className="py-1.5 text-xs uppercase tracking-wide">
                      {group.customer} subtotal
                    </td>
                    <td className="tnum py-1.5 text-right">{group.packages}</td>
                    <td colSpan={2} />
                    <td className="tnum py-1.5 text-right">
                      {group.cbm.toFixed(3)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <div className="relative overflow-x-auto print:overflow-visible">
          <table className="mt-6 w-full border-t-2 border-neutral-800 text-sm">
            <tbody>
              <tr className="font-bold">
                <td className="py-2 uppercase tracking-wide">
                  {groups.length} customer{groups.length === 1 ? "" : "s"} ·{" "}
                  {snap.lines.length} consignment
                  {snap.lines.length === 1 ? "" : "s"}
                </td>
                <td className="tnum py-2 text-right">
                  {groups.reduce((sum, g) => sum + g.packages, 0)} pkgs
                </td>
                <td className="tnum py-2 pl-6 text-right">
                  {Number(snap.totalCbm).toFixed(3)} m³
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <footer className="mt-8 grid grid-cols-1 gap-6 border-t pt-6 text-xs text-neutral-600 sm:grid-cols-2">
          <p>
            {list
              ? `Issued by ${list.issuedBy?.name ?? "Swift Cargo"} on ${formatDate(list.issuedAt)}.`
              : "Not yet issued. This sheet is drawn from what is in the container right now and changes as cargo is loaded or taken out. It is issued and frozen when the container is sealed."}
          </p>
          <div className="sm:text-right">
            {company?.chinaAddress ? <p>{company.chinaAddress}</p> : null}
            {company?.darAddress ? (
              <p className="mt-1">{company.darAddress}</p>
            ) : null}
          </div>
        </footer>
      </article>
    </div>
  );
}
