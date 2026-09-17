import Image from "next/image";

export type StickerData = {
  reference: string;
  shippingMark: string | null;
  customerName: string;
  customerPhone: string | null;
  description: string;
  cargoType: string | null;
  /** This box's place in the consignment — the "3" in "3 of 5". */
  sequence: number;
  total: number;
  packageRef: string;
  packagesLabel: string;
  weightLabel: string | null;
  cbmLabel: string | null;
  receivedOn: string;
  /** Pre-rendered on the server; a Decimal or a token never reaches the client. */
  qr: string;
};

/** 100 × 150 mm — the courier standard every thermal roll is already cut to. */
export const LABEL_MM = { width: 100, height: 150 } as const;

/**
 * THE STICKER THAT GOES ON ONE BOX.
 *
 * One per package, never one per consignment. Five cartons of shoes get five of
 * these, each with its own code, and the "3 / 5" in the corner is what tells the
 * Dar floor that four boxes on the ground is one short of a complete delivery.
 * A single label photocopied five times is exactly what makes a missing box
 * invisible until the customer is at the counter.
 *
 * Sized in millimetres throughout. A label is a physical object; rems depend on
 * a root font size that is a browser preference, and 58mm of QR is 58mm of QR on
 * any printer honest about its scaling.
 *
 * Laid out down the card rather than across it. At 100mm wide there is room for
 * one column or a cramped two, and a courier label is read top to bottom by
 * somebody walking past a pallet: whose box it is, then the code, then the
 * details that settle an argument.
 */
export function CargoSticker({ data }: { data: StickerData }) {
  return (
    <article
      className="sticker flex shrink-0 break-inside-avoid flex-col overflow-hidden border border-black/70 bg-white text-black"
      style={{
        width: `${LABEL_MM.width}mm`,
        height: `${LABEL_MM.height}mm`,
        padding: "4mm",
      }}
    >
      <header
        className="flex shrink-0 items-center justify-between border-b-2 border-black/70"
        style={{ paddingBottom: "2.2mm" }}
      >
        <div>
          <p
            className="font-bold uppercase leading-none tracking-widest"
            style={{ fontSize: "10pt" }}
          >
            Swift Cargo
          </p>
          <p className="leading-none" style={{ fontSize: "6pt", marginTop: "1mm" }}>
            Guangzhou → Dar es Salaam
          </p>
        </div>
        {/* Which box, of how many — read from across a loading bay before
            anyone bends down to pick the carton up. */}
        <p className="font-bold leading-none" style={{ fontSize: "16pt" }}>
          {data.sequence}
          <span style={{ fontSize: "9pt" }}> / {data.total}</span>
        </p>
      </header>

      {/* The name, biggest thing on the card. A clerk sorting a pallet is
          looking for a person, not a number. */}
      <div style={{ paddingTop: "3mm" }}>
        <p
          className="truncate font-bold uppercase leading-none"
          style={{ fontSize: "17pt" }}
        >
          {data.shippingMark ?? data.customerName}
        </p>
        {data.customerPhone ? (
          <p className="leading-none" style={{ fontSize: "9pt", marginTop: "1.6mm" }}>
            {data.customerPhone}
          </p>
        ) : null}
      </div>

      <div
        className="flex flex-1 flex-col items-center justify-center"
        style={{ paddingTop: "2mm" }}
      >
        <Image
          src={data.qr}
          alt=""
          width={520}
          height={520}
          unoptimized
          style={{ width: "58mm", height: "58mm" }}
        />
        <p
          className="font-bold leading-none tracking-wider"
          style={{ fontSize: "20pt", marginTop: "2.5mm" }}
        >
          {data.reference}
        </p>
        <p className="leading-none" style={{ fontSize: "7.5pt", marginTop: "1.5mm" }}>
          {data.packageRef}
        </p>
      </div>

      <footer
        className="shrink-0 border-t-2 border-black/70"
        style={{ paddingTop: "2.2mm" }}
      >
        <p className="truncate font-semibold" style={{ fontSize: "9pt" }}>
          {data.description}
        </p>
        <div
          className="flex flex-wrap justify-between"
          style={{ fontSize: "7.5pt", marginTop: "1.2mm", gap: "2mm" }}
        >
          <span>{data.packagesLabel}</span>
          {data.weightLabel ? <span>{data.weightLabel}</span> : null}
          {data.cbmLabel ? <span>{data.cbmLabel}</span> : null}
          <span>{data.receivedOn}</span>
        </div>
      </footer>
    </article>
  );
}
