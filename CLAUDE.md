# Swift Cargo

Sea freight ERP: Guangzhou → Dar es Salaam. Loose cargo (LCL) and full
containers (FCL), ~28–30 days at sea. **This will be a live business.** Real
staff will record real money in it, so a wrong figure on a screen is a wrong
figure in somebody's books.

- Reference architecture: `../TargetExpress` (air cargo, same stack). Reference
  for *technique* only — see `docs/ARCHITECTURE.md` §4 for what must not cross.
- Prior system: `../SwiftCargoTz` (Laravel + Flutter, live). Source of business
  truth and, eventually, of data.

## Stack

Next.js 15 App Router · React 19 (RSC + server actions) · Prisma 6 · Postgres ·
Tailwind · NextAuth v5.

## Rules that are not negotiable

**Every `"use server"` export calls `authorize(...)` itself.** A server action is
a public endpoint whether or not a button renders for it. A control that is
merely unrendered is not a permission.

**Money is derived, never stored.** Outstanding = `total − Σ(VERIFIED payments)`,
computed at read time. There is no balance column and there must never be one.

**Two measurements, both kept.** China and Dar each record their own weight,
count and CBM on their own receiving row. Neither row overwrites the other; the
screen shows both and the difference. That difference is the only evidence of
what happened at sea.

**The record belongs to the floor holding the cargo, and the bill follows it.**
Guangzhou corrects a consignment until Dar books it in; Dar corrects it from
then on, and — by the owner's decision — may also correct one not yet booked
in. Dar edits the package lines just as Guangzhou does: type, count, sides,
weight, volume. Every field that moves goes to `FieldChange` with the old value
first. After Dar check-in China's receiving totals are left as China measured
them and Dar's volume follows its corrected lines; a line is never removed and
its count never lowered — a carton that came off the container and is gone is a
case. After release Dar's count may still rise, never fall. A bill is priced
from the lines as they stand (Dar's totals first for untyped cargo), and every
correction — line, Dar's count, a second check-in — re-prices a DRAFT from the
rate book. An issued bill is never moved by a measurement; that is Finance's,
by discount or re-price with a reason.

**CBM is a figure the warehouse owns, and every version of it is kept.**
`lib/cbm.ts` is the only place that multiplies three sides by a quantity. The
receiving counter also accepts a volume typed straight in, because the paper
book has one volume column and a pallet of engine parts has no three sides — a
volume the dimensions do not account for is stored with `cbmOverridden`, which
never comes off the line. Any later change writes old value, new value, actor
and reason to `FieldChange` before it takes effect. Correcting a line stops when
the cargo stops being amendable by that desk; after that it takes
`cbm.override`.

**The rate book prices cargo types, per line.** `ShippingRate` rows are named by
the company's own categories, and each measured line is charged at the rate for
its own type — two hundred cartons of shoes and a machine on one note are not
the same money per cubic metre. A chosen type with no live rate is reported, not
quietly billed at a house default.

**The system does the arithmetic; the warehouse does the counting.** Receiving
asks for what is physically there — customer, category, packages, pieces,
weight, volume, receipt number, photos — and everything derivable follows from
it: the reference, the CBM, the valuation snapshot, the delivery note, the
inventory row, the timeline, the customer notification, the packing list, the
container totals. A screen that asks a clerk for a figure the system already
holds is a bug.

**Cargo waits in China until somebody loads it.** Receiving never asks which
container. Loading is picking existing consignments off the floor list — never
re-entering customer, mark, packages, pieces, weight, volume or category.

**The packing list is derived, not typed.** It is the container's contents read
back out, live while the box is open, frozen automatically when it is sealed.

**Dar reviews before it accepts.** Expected against actual, per consignment. A
consignment that did not come off the container becomes `MISSING_AT_DAR` with a
case — never a receiving record with zero packages — and the rest of the
container carries on being booked in.

**The warehouse never sees a price.** `CHINA_WAREHOUSE` has no `finance.view`,
and the receiving screens carry no money at all. The floor is asked to measure
honestly, which is easier when measuring has no visible price attached.

**Priced in USD, collected in TZS.** An invoice pins the `ExchangeRate` row it
used when it is issued. Never re-read today's rate against an older bill.
Balances are kept in whole shillings: each payment stores `baseCurrencyAmount`
at its own rate and `lib/invoice-balance.ts` compares that with the bill in
shillings. `lib/currency.ts` is the only place money changes currency (Decimal,
rounded once: USD to the cent, TZS to the shilling). Never add a USD column to a
TZS column. `npm test` covers the arithmetic.

**An invoice keeps the accounts it was issued with.** Issuing writes the live
collection accounts to `Invoice.paymentSnapshot`, and the invoice page and PDF
print that copy (`lib/invoice-accounts.ts`). Only drafts and bills issued before
the copy existed print today's accounts. Editing an account never redraws a bill
a customer is holding.

**VAT is on `CompanySetting`, not in code.** A tax rate changes by law, not by
deploy.

**The customer gate is `customerId` from the session.** Never an id from a URL,
a form field or a request body. Changing a number in an address bar is the whole
attack, and the only defence that works is never reading the number.

**Release is computed, not asserted.** No permission grants "this may go" —
`release.execute` is only the authority to act on the answer. A warehouse never
releases on a screenshot, a phone call or a customer's word.

**Document numbers come from `Counter`, inside the caller's transaction.**
Never from the bare prisma singleton.

**Sender ≠ receiver.** Cargo has both. The receiver is invoiced and may collect.
Releasing to the sender is releasing to the wrong person.

**Every state change is appended** — `CargoStatusHistory`, `ContainerEvent`,
`ExceptionEvent`, `FieldChange`, `AuditLog`. None of those is ever updated or
deleted.

## Language

Every user-facing string goes through `t(locale, "English")`. English is the key.
The dictionary is empty today and English-only is the launch decision — the
function exists now so that adding Swahili (the customer language) and Chinese
(the Guangzhou floor) is one file rather than every component.

## Comments

Comments explain constraints the code cannot show — why a guard exists, what
broke without it. Match the surrounding voice. Never write "fixed", "audit", or
reference a task.

## Verifying

Local Postgres (`swiftcargo`), dev server on `npx next dev -p 3177`. Drive the
real forms in a browser rather than trusting that it compiles. Seeded staff are
`<desk>@swiftcargo.co.tz` with `SEED_ADMIN_PASSWORD` from `.env`:
`admin`, `manager`, `support`, `china`, `dar`, `finance`.
