# Swift Cargo — how to run and test it

## Start

```bash
npx next dev -p 3177
```

Open **http://localhost:3177**. Postgres database `swiftcargo` is already
created and seeded.

To reset and reseed from scratch (drops the local database, re-applies
`prisma/migrations/`, runs `prisma/seed.ts`; see docs/DEPLOY-DATABASE.md for
schema changes and production):

```bash
npm run db:reset
npx tsx prisma/dev/seed-demo-cargo.ts
npx tsx prisma/dev/seed-demo.ts
```

## Sign in

Every account uses the password **`SwiftCargo2026!`**

| Who | Email | What they see |
|---|---|---|
| Admin | `admin@swiftcargo.co.tz` | Everything, plus users and settings |
| Manager | `manager@swiftcargo.co.tz` | Everything except users, settings, warehouses |
| China Warehouse | `china@swiftcargo.co.tz` | Receiving, containers, packing lists |
| Dar Warehouse | `dar@swiftcargo.co.tz` | Discharge, verification, release, deliveries |
| Finance | `finance@swiftcargo.co.tz` | Rates, invoices, payments, receipts, profit |
| Customer Support | `support@swiftcargo.co.tz` | Inbox, customers, requests, chase list |
| **Customer** | `fatuma@example.co.tz` | Her own portal only |

## Worth trying

**The release gate (the most important rule).** Sign in as **dar** and open
*Ready for release*. Consignments that cannot go show exactly which of the seven
conditions failed. Nothing can override it — settle the missing thing and it
clears by itself.

**Verified vs claimed payments.** As **finance**, open an invoice, record a
payment, then look at *Ready for release* — the cargo is still blocked. Verify
the payment on *Verify payments* and it clears in the same request. A receipt is
issued automatically.

**The CBM engine.** Open any cargo as **china** and add a measured line. 12 items
at 60 × 40 × 40 **cm** gives 1.152 m³; the same box entered as 0.6 × 0.4 × 0.4
**metres** gives the identical figure. There is no CBM field — the server
computes it. Overriding one costs a permission and a reason, and the original
measurement is kept.

**China vs Dar.** As **dar**, receive something on *Receive (Dar)* and enter a
package count different from China's. The discrepancy panel appears as you type,
a case opens automatically, and the cargo is held from release until it is
resolved.

**One container, many customers.** As **china**, open a container and load
several consignments, then issue the packing list — one line per customer, with
each shipping mark.

**The customer's view.** Sign in as **fatuma@example.co.tz**. She sees her own
cargo and nothing else, her shipping mark, and the real Guangzhou address to
forward to a supplier.

**Public site.** Sign out and browse `/`, `/rates`, `/calculator`, `/schedule`,
`/track`. Rates and sailings are read live from the database — change one in
*Finance → Rates* or *Admin → Website content* and the public page follows.

**Try to break the boundaries.** Signed in as **china**, type
`/app/finance/verify` into the address bar. As a customer, try `/app/dashboard`.
Both are refused server-side, not by hiding a button.

## What is deliberately not built

- No live vessel GPS. Milestones are entered by staff, because we have no
  tracking feed and animating a guessed position would be a lie.
- No SMS or WhatsApp sending. Notifications are stored as events so an
  integration can read them later; the system stays the source of truth.
- English only at launch. Every string goes through `t()` so Swahili and Chinese
  are a dictionary, not a refactor.

## Prices, and who may see them

The rate book carries the company's own categories — 38 of them, priced per
cubic metre except Bolt & Nuts, which is per kilo. Finance keeps it at
**Rates**; nobody else may edit it.

**At the counter (China).** Receiving asks for a cargo type on every item line
and takes the volume straight in, the way the paper book does — typing three
sides fills the volume in for you, and you can still type over it. There is no
money anywhere on that screen and there is not meant to be.

**In the office.** Open the same consignment as Finance and a card called
*Value at today's rates* prices every line against the book: shoes at 350,
machinery at 500, the subtotal underneath. It is an estimate that moves with the
rate book — only an invoice pins a price. A line whose category has no live rate
is listed as unpriced rather than quietly charged at a house rate.

**Check the wall holds.** Open one consignment as `china`, then as `dar`, then
as `finance`. Neither floor sees the card; the office does. `support` and
`manager` see it too, because they answer "how much will this be" on the phone.

**The bill follows the lines.** Raise an invoice on a landed consignment and
each item is charged at the rate for its own cargo type, one invoice line each.
Mixed loads are the point: two hundred cartons of shoes and one machine are not
the same money per cubic metre.

**The packing list.** Issue one for a container and it prints grouped by
customer — item rows with the Chinese description, the cargo type, packages,
pieces and volume, a subtotal per customer, and the container total underneath.

## The whole chain, one customer

A walk-through that exercises everything added for the operating model.

1. **Receive (china).** Two item lines, different categories. No money appears
   anywhere on that screen. Confirming mints the reference, computes the CBM,
   stores the valuation snapshot, writes the delivery note, files the cargo into
   Guangzhou inventory, stamps the timeline and notifies the customer.
2. **Load (china).** Open a container, tick the consignments waiting in
   Guangzhou, press Load. Nothing is re-entered. The container's summary —
   consignments, customers, packages, pieces, weight, volume — adds itself up.
3. **Packing list.** Open it before sealing: it says *Provisional* and follows
   what is in the box. Seal the container and it freezes with a number.
4. **Sail (china → dar).** China records the departure; Dar records the arrival.
   Each desk sees only its own step.
5. **Review (dar).** `/app/receive/dar` shows expected against arrived per
   consignment. Receive one; mark another **Not here**. The missing one goes to
   `MISSING_AT_DAR` with an urgent case and does **not** enter Dar inventory —
   and the other is unaffected. **Found it** brings it back if it turns up.
6. **Bill (finance).** Raise the invoice: one line per cargo type at its own
   rate. If the lines and Dar's measurement disagree, the invoice says so.
7. **Take the money (finance).** On the cargo record: amount, currency, and the
   line that reads *TZS 3,916,567 settles USD 1,477.95 at 2,650*. Change the
   rate for that one payment and the credited figure moves; the bill does not.
   If the customer has other open bills, take it as **one payment** — it spreads
   oldest first, in full, and part-pays the last one it reaches.
8. **Tell them (support).** *Notify on WhatsApp* opens WhatsApp with the message
   already written in Swahili and English, filled in from the consignment. Staff
   press send; the system logs that we contacted them, not that it was
   delivered.
