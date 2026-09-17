import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { describe, test } from "node:test";

/**
 * WHAT A REFERENCE MAY PUBLISH, AND WHAT IT MAY NOT.
 *
 * The owner chose to publish the consignment — the goods, the volume, the
 * photographs, the bill — to anybody holding a reference. That decision is
 * written down in lib/tracking.ts. This is the other half of it: the record
 * handed in here carries a telephone number, two full names, an internal note,
 * a case reference and a staff name, and not one of them may come back out.
 *
 * It works on the payload as a whole rather than field by field. A new field
 * added to the record later is caught by the same assertions, which is the
 * point — the leak nobody catches is the one nobody wrote a test for.
 *
 * `server-only` refuses to load outside the Next server, and the module under
 * test is server code for that reason alone, so it is answered with an empty
 * module before it loads. No database: `publicTracking` is pure.
 */
const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename =
  function (this: unknown, request: unknown, ...rest: unknown[]) {
    if (request === "server-only") {
      return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
    }
    return resolve.call(this, request, ...rest);
  };

const { publicTracking, initialsOf } = require("@/lib/tracking") as typeof import("@/lib/tracking");
const { publicJourney } = require("@/lib/tracking-stage") as typeof import("@/lib/tracking-stage");

type Source = Parameters<typeof publicTracking>[0]["cargo"];
type Invoice = NonNullable<Parameters<typeof publicTracking>[0]["invoice"]>;

/* The wall clock, not a fixed date: the warehouse clock in lib/storage-fee.ts
   counts up to now, so a fixture pinned to a calendar day would read one day
   short or one day long depending on the hour the test happened to run. */
const NOW = new Date();
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

/* Everything a leak would be made of, spelled out so an assertion can look for
   it. None of these strings is allowed to appear in the payload. */
const PRIVATE = {
  senderName: "Grace Mwaijande Hassan",
  receiverName: "Juma Ally Kileo",
  phone: "+255 712 000 111",
  internalNote: "Customer argued about the CBM at the counter",
  caseReference: "EXC-2026-000031",
  staffName: "Amina Said",
  otherCargo: "SC0002",
  receiptUrl: "/uploads/receipts/9f3c.png",
};

function source(over: Partial<Source> = {}): Source {
  return {
    reference: "SC0001",
    service: "LCL",
    status: "RECEIVED_DAR",
    description: "Ladies handbags and purses",
    sender: { fullName: PRIVATE.senderName },
    chinaReceiving: {
      packagesCount: 12,
      piecesCount: 240,
      cbm: "1.4400",
      receivedAt: day(-40),
    },
    darReceiving: {
      packagesCount: 12,
      piecesCount: 240,
      cbm: "1.5000",
      receivedAt: day(-3),
    },
    photos: [
      { id: "p1", url: "/uploads/sample-cargo-1.png", caption: "Boxes at the counter" },
    ],
    containerLines: [
      { container: { reference: "SWC-CNT-0007", shipment: { vessel: "MSC Ilona" } } },
    ],
    history: [
      { to: "RECEIVED_CHINA", createdAt: day(-40) },
      { to: "DEPARTED_CHINA", createdAt: day(-33) },
      { to: "ARRIVED_TANZANIA", createdAt: day(-4) },
      { to: "RECEIVED_DAR", createdAt: day(-3) },
    ],
    ...over,
  };
}

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    number: "INV-2026-000005",
    status: "ISSUED",
    currency: "USD",
    total: "424.80",
    discount: "0",
    vatPercent: "18",
    vatAmount: "64.80",
    fxRate: "2700",
    totalTzs: "1146960",
    items: [
      {
        description: "Sea freight — Ladies handbags and purses",
        quantity: "1.4400",
        unit: "CBM",
        unitPrice: "250.0000",
        amount: "360.00",
      },
    ],
    payments: [],
    ...over,
  };
}

const SETTINGS = {
  freeStorageDays: 7,
  storagePerDay: "5.00",
  storageCurrency: "USD",
  whatsapp: "255767852126",
  phone: "+255 767 852 126",
  darAddress: "Kariakoo, Dar es Salaam",
};

const ACCOUNTS = [
  {
    kind: "MOBILE_MONEY" as const,
    bankName: "Vodacom M-Pesa",
    accountName: "SWIFT CARGO TZ LIMITED",
    accountNumber: "5581590",
    branch: null,
    currency: "TZS",
  },
];

function build(over: Partial<Parameters<typeof publicTracking>[0]> = {}) {
  const cargo = over.cargo ?? source();
  return publicTracking({
    cargo,
    journey: publicJourney({
      status: cargo.status,
      stamps: Object.fromEntries(cargo.history.map((h) => [h.to, h.createdAt])),
      container: {
        status: "ARRIVED",
        departedAt: day(-33),
        arrivedAt: day(-4),
        eta: day(-4),
      },
      billing: { issuedAt: day(-3), owes: true, pendingClaim: false },
      releasable: false,
      onHold: false,
      now: NOW,
    }),
    invoice: invoice(),
    accounts: ACCOUNTS,
    settings: SETTINGS,
    liveRate: "2700",
    ...over,
  });
}

describe("what a reference publishes", () => {
  test("the consignment, the bill and the photographs are on it", () => {
    const result = build();

    assert.equal(result.reference, "SC0001");
    assert.equal(result.description, "Ladies handbags and purses");
    /* Dar's own measurement, once Dar has taken one. */
    assert.equal(result.cbm, "1.500");
    assert.equal(result.countedAs, "12 packages · 240 pieces");
    assert.equal(result.containerReference, "SWC-CNT-0007");
    assert.equal(result.photos.length, 1);

    assert.equal(result.charge?.invoiceNumber, "INV-2026-000005");
    assert.equal(result.charge?.outstanding, "424.80");
    /* The bill's own pinned rate, never today's. */
    assert.equal(result.charge?.outstandingTzs, "1146960");
    assert.equal(result.charge?.status, "UNPAID");
    assert.equal(result.accounts[0].accountNumber, "5581590");
  });

  test("the lines carry the arithmetic, read off the invoice", () => {
    const lines = build().charge!.lines;
    assert.equal(lines[0].note, "USD 250.00/CBM × 1.440 CBM");
    assert.equal(lines[0].amount, "360.00");
    assert.equal(lines[1].label, "VAT 18%");
    assert.equal(lines[1].amount, "64.80");
  });

  test("a discount is a line of its own, signed", () => {
    const result = build({
      invoice: invoice({ discount: "40.00", total: "384.80", totalTzs: "1038960" }),
    });
    const discount = result.charge!.lines.find((l) => l.label.startsWith("Punguzo"));
    assert.equal(discount?.amount, "-40.00");
  });

  test("the shipper is initials, never the name", () => {
    const result = build();
    assert.equal(result.shipperInitials, "G. M. H.");
    assert.equal(initialsOf("Juma Ally Kileo"), "J. A. K.");
    assert.equal(initialsOf("  "), "—");
  });

  test("nothing private survives the trip", () => {
    /* Everything below the allow-list is on the record handed in — the sender's
       name through `sender.fullName`, the rest never selected at all — and the
       payload is searched as one string so a field added later is caught too. */
    const payload = JSON.stringify(
      build({
        cargo: {
          ...source(),
          /* A record carrying what the query must never select. */
          ...({
            internalNotes: PRIVATE.internalNote,
            notes: PRIVATE.internalNote,
            receiver: { fullName: PRIVATE.receiverName, phone: PRIVATE.phone },
            exceptions: [{ reference: PRIVATE.caseReference, status: "OPEN" }],
            createdBy: { name: PRIVATE.staffName },
            receipts: [{ url: PRIVATE.receiptUrl }],
            siblings: [{ reference: PRIVATE.otherCargo }],
          } as unknown as object),
        } as Source,
      })
    );

    for (const [what, value] of Object.entries(PRIVATE)) {
      assert.ok(
        !payload.includes(value),
        `${what} reached the public payload: ${value}`
      );
    }
  });

  test("a case is a neutral sentence, never its contents", () => {
    const cargo = source();
    const result = publicTracking({
      cargo,
      journey: publicJourney({
        status: "RECEIVED_DAR",
        stamps: { RECEIVED_DAR: day(-3) },
        container: null,
        billing: { issuedAt: null, owes: false, pendingClaim: false },
        releasable: false,
        onHold: true,
        now: NOW,
      }),
      invoice: null,
      accounts: [],
      settings: SETTINGS,
      liveRate: "2700",
    });

    assert.equal(result.journey.headline, "On hold");
    assert.ok(!result.note.en.includes("EXC-"));
    assert.equal(result.charge, null);
  });

  test("a consignment nobody can find is not told the case's words", () => {
    const cargo = source({ status: "MISSING_AT_DAR" });
    const result = publicTracking({
      cargo,
      journey: publicJourney({
        status: "MISSING_AT_DAR",
        stamps: { ARRIVED_TANZANIA: day(-4) },
        container: null,
        billing: { issuedAt: null, owes: false, pendingClaim: false },
        releasable: false,
        onHold: true,
        now: NOW,
      }),
      invoice: null,
      accounts: [],
      settings: SETTINGS,
      liveRate: null,
    });

    /* Never "Under investigation", which is the company's phrase for its own
       case file — see CARGO_STATUS_META. */
    assert.equal(result.location, "Being located");
  });
});

describe("the warehouse clock", () => {
  test("counts from the day Dar booked it in, free days first", () => {
    const storage = build().storage!;
    assert.equal(storage.daysInWarehouse, 3);
    assert.equal(storage.freeDaysRemaining, 4);
    assert.equal(storage.chargeableDays, 0);
    assert.equal(storage.charge, "0.00");
    assert.equal(storage.chargeTzs, "0");
  });

  test("the last free day still counts as a day", () => {
    const cargo = source({
      darReceiving: {
        packagesCount: 12,
        piecesCount: 240,
        cbm: "1.5000",
        receivedAt: day(-7),
      },
    });
    const storage = build({ cargo }).storage!;
    assert.equal(storage.chargeableDays, 0);
    assert.equal(storage.freeDaysRemaining, 1);
  });

  test("charges once the free days are gone, at today's rate", () => {
    const cargo = source({
      darReceiving: {
        packagesCount: 12,
        piecesCount: 240,
        cbm: "1.5000",
        receivedAt: day(-10),
      },
    });
    const storage = build({ cargo }).storage!;
    assert.equal(storage.chargeableDays, 3);
    assert.equal(storage.charge, "15.00");
    assert.equal(storage.chargeTzs, "40500");
  });

  test("no clock at all until Dar has the boxes", () => {
    const cargo = source({ status: "IN_TRANSIT", darReceiving: null });
    assert.equal(build({ cargo }).storage, null);
  });
});
