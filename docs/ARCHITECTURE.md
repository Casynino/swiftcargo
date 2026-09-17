# Swift Cargo — Inspection, Comparison & Architecture

Sea freight, China → Tanzania. This document is the output of Steps 1–6: what
exists, what Target Express can lend, what it must not lend, and the design that
follows from the actual Swift Cargo business.

---

## 1. What was inspected

| Location | What it is | Verdict |
|---|---|---|
| `/3-Devs/Swift` | **Empty.** One folder, `logo/`, holding two logo files. | Greenfield. There is no existing Swift Cargo code here to preserve. |
| `/3-Devs/SwiftCargoTz` | A **real, deployed Swift Cargo system**: Laravel 11 API + Flutter app. Deployed on Contabo (`38.242.135.172`), MySQL, Sanctum auth, Spatie permissions. | The authoritative source of *Swift Cargo business truth*. Not a UI reference. |
| `/3-Devs/TargetExpress` | Air cargo ERP, Guangzhou/Hong Kong → Dar. Next.js 15 · React 19 · Prisma 6 · Postgres · NextAuth v5 · Tailwind. 3,419-line schema, 54 models, 84 permissions. Live business. | The **technical and architectural** reference. |
| `instagram.com/swift_cargo_tz` | The public face of the business. | Source of real customer-facing facts. |

**The instruction "do not break existing functionality" has no target in `/Swift`.**
It does have a target in `/SwiftCargoTz` — see §7, Open Decision 1.

---

## 2. Swift Cargo, as the business actually presents itself

From the Instagram profile (3,893 followers):

- **Bio, in Swahili:** *"TUNASAFIRISHA MIZIGO KUTOKA CHINA 🇨🇳 KUJA TANZANIA 🇹🇿.
  LOOSE CARGO NA FULL CONTAINER"* — we ship cargo from China to Tanzania, loose
  cargo and full container.
- **Two headline services:** LCL (loose / shared) and FCL (full container).
  Plus **China sourcing / procurement**.
- **Phones:** 0767 852 126 · 0656 852 121 · WhatsApp `wa.me/255767852126`
- **Tanzania office:** PSSSF Commercial Complex, 2nd Floor (Dar es Salaam)
- **China warehouse:** 广州市白云区石井街庆丰庆隆中188号 C1-01
  (Guangzhou, Baiyun District, Shijing Street — Qingfeng Qinglong Zhong 188, C1-01)
- **Transit time quoted publicly:** ~28–30 days.

Three consequences the brief does not mention:

1. **The customer-facing language is Swahili**, not English. The public site and
   the customer portal need EN + SW. The Guangzhou warehouse needs ZH.
2. **That Guangzhou address is a first-class system object.** The entire flow in
   the brief starts with "customer gives the Swift Cargo warehouse address to
   their supplier" — so the address (in Chinese characters, copyable, with the
   customer's shipping mark appended) is a *feature*, not footer text.
3. **28–30 days is the promise the ETA must be measured against.** Public
   schedule and tracking should show progress against it.

---

## 3. What the existing Swift Cargo (Laravel) system already knows

This is the part that must survive. These are real columns from a system real
staff have been using — they encode business rules the brief omits.

| Fact in the Laravel schema | Why it matters | In the brief? |
|---|---|---|
| `cargos.sender_id` **and** `cargos.receiver_id`, both → `customers` | The person who ships from China is often **not** the person who collects in Dar. | ❌ Missing — brief says only "Customer" |
| `vat_percent`, `vat_amount`, `total_vat_amount`, `sub_total` | Tanzania VAT is charged and shown on the invoice. | ❌ Missing |
| `exchange_rate_id` + `exchange_rate` + `exchange_rate_date` on **both** cargo and package | Priced in USD, collected in TZS. The rate is **pinned per record**, not read live. | ❌ Missing |
| `total_tzs` alongside USD totals | Dual-currency invoices are the norm. | ❌ Missing |
| `price_rates(cargo_type, cbm, price_usd)` and `price_configs(derivation_type: weight\|cbm, cargo_type)` | Rate depends on **cargo type**, and some cargo bills by **weight**, not CBM. | ⚠️ Partially — brief assumes CBM only |
| `container_expenses` + `vendors` + `expense_types` (billable, `billed_to_customer_id`) | Container-level P&L: shipping line, clearing, transport, per container. | ❌ Missing |
| `cargo_packages.container_id` (separate from `cargos.container_id`) | Packages of one cargo **can split across containers**. | ⚠️ Brief says one cargo → one container |
| `baller_number`, `unit_type`, `piece_count` vs `packages_count` | Loose cargo is baled; pieces ≠ packages. | ❌ Missing |
| `quotations` with `FULL_CONTAINER` / `SHARED_CONTAINER` / `SPECIAL_CARGO`, hazardous + fragile flags, `quote_expires_at` | The public quote flow already has a shape. | ✅ Matches §40 |
| `ship_voyages` with `good_reception_deadline` | The **cargo receiving deadline** — the date the China warehouse stops accepting for a sailing. | ✅ Matches §42 |
| `cargo_payments.confirmation_status` + `payer_account_name/number/bank` | Payment verification workflow already exists. | ✅ Matches §27 |

**Four of these are business-critical and absent from the brief: sender/receiver,
VAT, pinned FX, and container expenses.** They are carried into the design below.

---

## 4. Target Express: KEEP / MODIFY / DO NOT USE

### KEEP — take these almost verbatim

These are hard-won and domain-neutral.

| Pattern | Where | Why it transfers |
|---|---|---|
| **Permission-not-role RBAC.** 84 fine-grained permissions; roles are just named bundles. Every guard asks for a permission. | `lib/rbac.ts` | Adding a 7th department becomes a table edit, not a refactor. Exactly what §35 asks for. |
| **The session says *who*; the database says *what they may do*.** Live `User` read on every request, cached per-request, so "remove access" means *now* — not when the JWT expires. | `lib/session.ts` | Solves the real problem of a suspended clerk still recording payments for 12 hours. |
| **`authorize()` in every `"use server"` export.** A hidden button is not a permission. | Everywhere | §35 and §53, precisely. |
| **Edge-safe split auth** (`auth.config.ts` vs `auth.ts`) — middleware checks *session existence only*, never role. | `middleware.ts` | Middleware cannot reach the DB; a stale token role disagreeing with the live role is worse than one layer fewer. |
| **`Counter`-table document numbers minted inside the caller's transaction.** | `lib/ids.ts` | Two clerks cannot mint the same invoice number. Directly serves §5. |
| **Money is Decimal, never Float. Balances are *derived*, never stored.** `outstanding = total − paid`, computed at read. | schema + `lib/invoice-balance.ts` | The Laravel system stores `paid_amount` / `total_paid_fees` — those columns are exactly what drifts. |
| **Append-only ledger; a wrong line is answered by a reversing line (`reversesId`), never edited.** | `lib/ledger.ts` | §45 audit integrity. |
| **Concurrency idiom:** re-state the condition you read as a conditional `updateMany`, check `count === 0`, throw, transaction unwinds. | Everywhere money moves | The correct pattern for release-authorisation races. |
| **Public tracking by explicit allow-list**, never by omission. Opaque `qrToken` ≠ public tracking number, so a guessed number can't release cargo. | `lib/tracking.ts`, `lib/ids.ts` | §36 and §53. |
| **`AuditLog` + per-entity status history + `FieldChange`**, all append-only. | schema | §45 verbatim. |
| **i18n keyed by the English string**, not invented codes. | `lib/i18n.ts` | Reused for EN/SW/ZH. |
| **Notifications written in the same transaction as the event.** | `lib/notify.ts` | §11: the system, not WhatsApp, is the source of truth. |
| **`BookingRequest` is deliberately NOT a shipment** — "a promise, not cargo". | schema | §40 and §41, exactly as the brief demands. |
| Server-action layer in `lib/actions/*`, RSC pages, shadcn/Radix UI kit, `Setting`/`CompanySetting` tables so rates are never hard-coded. | — | §24, §39. |

### MODIFY — the idea is right, the shape is wrong

| Target Express | Swift Cargo must instead |
|---|---|
| `Batch` = one flight (GZ-0028 / HK-0013) | `Container` = one box (SWC-CN-2026-005), with **seal number, shipping line, vessel, voyage, ports, CBM totals** and its own **expense ledger**. A batch has a capacity in kg; a container has a capacity in CBM. |
| `cargoCustody()` splits at the **arrival scan** (OUTBOUND / LANDED) | Same rule, split at **Dar container discharge**. China owns the record until the container is unloaded; Dar owns it after. This is one of the best ideas in the codebase — keep the mechanism, move the boundary. |
| Priced at **Dar check-in**, from confirmed weight | Priced from **CBM at China loading**, re-validated against **Dar measurement**. Sea freight is sold on volume booked, not on what survives. |
| `PricingRule` is per-kg with a 1 kg minimum | `ShippingRate` is **per-CBM with a minimum CBM**, plus per-kg for dense/special cargo (`derivation_type` from the Laravel system). |
| `ShipmentStatus`: 5 stages, air-shaped | 11 sea milestones (§36), driven by container events, not per-piece events. |
| `Notification` targets `userId` (staff only) | Must also target **customers** — polymorphic recipient. |
| Public tracking is anonymous-only, one code at a time | Anonymous tracking **plus** an authenticated customer portal listing all their cargo. |
| Storage: free 7 days then USD 2/day | Sea freight demurrage/storage differs; configurable, and **must not be copied as a number**. |
| EN/ZH i18n | **EN/SW/ZH.** Swahili is the customer language. |

### DO NOT USE — air-cargo logic that must not enter Swift Cargo

- `Origin { GUANGZHOU, HONG_KONG }` and the **category→airport routing rule**
  (electronics and liquids fly Hong Kong). There is one sea origin.
- `CargoCategory { NORMAL_GOODS, ELECTRONICS, LIQUID_SPECIAL }` as a *routing*
  driver. Commodity type matters to Swift Cargo for **rate and customs**, not
  for which port it leaves from.
- `lib/aircraft.ts`, `lib/flights.ts`, `lib/route-land.ts`, chargeable-weight
  and volumetric-divisor logic, `BatchStatus.READY_TO_DEPART → IN_TRANSIT`
  flight semantics, airway-bill numbering.
- **Per-kg-first pricing.** Sea freight is CBM-first; inheriting per-kg as the
  default is the single most likely way to get Swift Cargo's economics wrong.
- The 1 kg minimum chargeable weight.
- `batchNumberFor(route, n)` prefixing by departure airport.
- Anything that assumes **one batch = one physical load leaving one place on one
  day**. A container is sealed once and then unreachable for 28 days — a much
  longer and less correctable window.

---

## 5. Gap analysis — the brief (§§1–56) against what exists

Nothing exists in `/Swift`. So the honest table is *where each requirement can
be sourced from*:

| Area | Reusable from Target Express | Must be built new for sea freight |
|---|---|---|
| Auth, session, RBAC, audit | ~90% | `CUSTOMER` role + customer-owned data isolation |
| Admin / user / role management | ~85% | Department list is different |
| Manager (separate from Admin) | ~80% — TX already has the "operator with oversight, no power to rewrite the rules" split | Sea-specific dashboards |
| Customer Support | ~70% — tickets, messages, follow-up all exist | Customer-context sidebar (§10) |
| China Warehouse receiving | ~60% — receiving, photos, packages | **Delivery Note** (new), shipping-mark identification, unmatched-cargo queue |
| **Container management** | ~15% | Essentially all of §16 |
| **Packing List** | 0% | All of §17 |
| **CBM engine** | 0% | All of §18, incl. unit storage + override audit |
| Shipment / voyage tracking | ~35% | Vessel, voyage, shipping line, ports, seal, 11 milestones |
| Dar receiving & verification | ~70% — the China-vs-Dar dual-measurement idea already exists | Container discharge, CBM variance |
| Exceptions | ~90% | Container/customs exception types |
| Finance: invoices, payments, receipts | ~80% | **VAT**, **pinned FX**, per-CBM rates, container P&L |
| Release control | ~85% — `isCollectable` / `payable.ts` is exactly §29 | — |
| Collection / Delivery | ~70% | Delivery request lifecycle (§31) |
| Notifications | ~75% | Customer as recipient |
| Public website | ~65% — hero, tracking, calculator, forms, schedule all exist | Sea copy, Swahili, CBM calculator, FCL/LCL booking |
| **Customer portal** | **0% — Target Express has no customer login at all** | All of §8 |
| Global internal search | ~60% | New entity types |

**The two largest genuinely-new builds are Container/Packing-List/CBM (§16–18)
and the Customer Portal (§7–8).** Everything else is adaptation.

---

## 6. Proposed architecture

### 6.1 Stack

Mirror Target Express, because the team already runs it and it is proven:
Next.js 15 App Router · React 19 (RSC + server actions) · Prisma 6 · Postgres ·
NextAuth v5 (credentials) · Tailwind · shadcn/Radix · Vercel + Neon.

### 6.2 Roles and departments

```
Role            ADMIN · MANAGER · CUSTOMER_SUPPORT · CHINA_WAREHOUSE
                DAR_WAREHOUSE · FINANCE · CUSTOMER
Department      MANAGEMENT · CUSTOMER_SUPPORT · CHINA_WAREHOUSE
                DAR_WAREHOUSE · FINANCE
```

`CUSTOMER` is a role with **no department** — it is not staff. Every customer
query is scoped by `customerId` derived from the session server-side, never from
a URL parameter (§53).

### 6.3 The cargo chain (§4, §48)

One `Cargo` row, created once, carrying the same `reference` + `qrToken` from
Guangzhou to release. Everything else hangs off it:

```
Customer ──┬─ (sender)   ┐
           └─ (receiver) ┴─> Cargo ─┬─> CargoPackage[]   (L×W×H, unit, CBM)
                                    ├─> CargoPhoto[]
                                    ├─> ChinaReceiving ──> DeliveryNote
                                    ├─> ContainerCargo ──> Container ──> Shipment
                                    │                       └─> ContainerExpense[]
                                    ├─> PackingListLine[]
                                    ├─> DarReceiving     (own measurements, never overwriting China's)
                                    ├─> Invoice ─> InvoiceItem[] ─> Payment[] ─> Receipt
                                    ├─> ExceptionCase[]
                                    └─> Release ─> Collection | Delivery
```

### 6.4 Decisions that need stating explicitly

**Sender and receiver.** `Cargo.senderId` and `Cargo.receiverId`, both to
`Customer`, both required, often the same row. The **receiver** is who the
invoice addresses and who may collect; the **sender** is who the shipping mark
belongs to. This comes straight from the live Laravel schema and is not in the
brief.

**CBM, and the unit that produced it.** Store `lengthCm`, `widthCm`, `heightCm`,
`quantity`, `unit` (`CM` | `M`) **and** `cbm` as `Decimal(12,4)`. Compute:

```
CM: cbm = L × W × H × qty ÷ 1_000_000
M : cbm = L × W × H × qty
```

`cbm` is written by the server from the inputs — never accepted from a form. A
manual override needs `cbm.override`, and writes a `FieldChange` row carrying old
value, new value, actor, reason, timestamp (§18). Never silently overwritten.

**Two measurements, both preserved.** `ChinaReceiving` and `DarReceiving` are
separate rows with their own weight, package count and CBM. The UI shows
*China / Dar / difference*. Neither ever overwrites the other (§21). This is the
single most important auditability rule in the warehouse layer.

**Money.** `Decimal` throughout. `subtotal`, `vatPercent`, `vatAmount`, `total`
in **USD**; `fxRateId` pins the `ExchangeRate` row used; `totalTzs` derived and
stored *as a snapshot on the issued invoice only*. Balance is **always derived**:
`total − Σ verified payments`. No stored balance column anywhere.

**Rates.** `ShippingRate { origin, destination, service, cargoType, basis
(PER_CBM | PER_KG), rate, minimumCbm, currency, effectiveFrom, effectiveTo,
status }`. The invoice stores `standardRate`, `appliedRate` and `variance` at
issue time (§25); changing the rate book never moves an issued invoice (§24).

**Container splitting.** `ContainerCargo` is a join row at **package** grain, not
cargo grain — because the live system already splits packages across containers.
A cargo has one *current* container in the common case, and the model does not
break when it doesn't.

**Container P&L.** `ContainerExpense { container, expenseType, vendor, amount,
currency, fxRate, billable, billedToCustomerId }`, carried over from the Laravel
system. Without it the business cannot tell whether a sailing made money.

**Release authorisation is computed, never asserted.** A single server function
answers "may this be released?" from: Dar received ∧ verified ∧ no financial hold
∧ no operational hold ∧ invoice issued ∧ balance ≤ 0 ∧ authorisation present.
The warehouse screen renders that function's answer and offers no override
(§29). Modelled on Target Express `lib/payable.ts`.

### 6.5 Statuses

```
ContainerStatus  OPEN · LOADING · LOADED · SEALED · DEPARTED
                 IN_TRANSIT · ARRIVED · CLOSED
ShipmentStatus   PREPARING · READY · DEPARTED_CHINA · IN_TRANSIT
                 ARRIVED_TANZANIA · CLEARANCE · CLEARED · DAR_WAREHOUSE · COMPLETED
CargoStatus      REGISTERED · RECEIVED_CHINA · ASSIGNED · LOADED · IN_TRANSIT
                 ARRIVED_TZ · RECEIVED_DAR · VERIFIED · INVOICED · PAID
                 READY_FOR_RELEASE · COLLECTED · DELIVERED · CANCELLED
InvoiceStatus    DRAFT · ISSUED · PARTIALLY_PAID · PAID · OVERDUE · CANCELLED
PaymentStatus    PENDING · VERIFIED · REJECTED · REVERSED
```

Container status drives shipment status drives cargo status — cargo milestones
are **derived from container events**, not typed per piece. That is the core
structural difference from Target Express, where each box was checked off a
manifest individually.

### 6.6 References (§5)

```
Cargo SWC-2026-000125 · Shipping mark SWC-NINO-125 · Customer CUS-000125
Delivery Note DN-2026-000125 · Container SWC-CN-2026-005 (+ real MSCU1234567)
Packing List PL-2026-000012 · Shipment SHP-2026-000012
Invoice INV-2026-000125 · Receipt RCT-2026-000125 · Release REL-2026-000125
Booking BK-000125 · Pickup PU-000125 · Exception EXC-2026-000125
```

All minted from a `Counter` table inside the caller's transaction.

### 6.7 Route map

```
/                     public site (EN/SW)
/track, /track/[code] tracking
/calculator           CBM calculator
/rates                published rates, from the database
/schedule             sailings + receiving deadlines
/book, /pickup, /quote  requests
/login, /register
/portal/*             customer portal   — role CUSTOMER, scoped by session
/app/*                staff              — role ≠ CUSTOMER
  /app/dashboard · /app/cargo · /app/receive · /app/containers
  /app/packing-lists · /app/shipments · /app/verification · /app/release
  /app/finance/* · /app/support/* · /app/exceptions · /app/manager/* · /app/admin/*
```

Two separate shells. A `CUSTOMER` reaching `/app/*` is bounced; a staff member
reaching `/portal/*` is bounced. Both enforced at the page and at every action.

---

## 7. Open decisions — needed before Step 7

**1 · Which codebase is Swift Cargo going forward?** `/Swift` is empty, but
`/SwiftCargoTz` is a *live Laravel + Flutter system with real data*. Either we
build fresh in `/Swift` on the Target Express stack and treat the Laravel schema
as a data-migration source, or we extend the Laravel system. These are very
different projects. **This is the blocking question.**

**2 · Does the Flutter app stay?** It is the warehouse's scanning tool. A Next.js
rebuild either replaces it (PWA + camera) or must keep serving its API.

**3 · VAT.** Confirm 18% Tanzania VAT, and whether it applies to freight for all
customers or only VAT-registered ones.

**4 · Languages at launch.** EN + SW is the minimum. ZH for Guangzhou — now or
phase 2?

---

## 8. Phase plan

Ordered so each phase is independently useful and nothing is built before the
thing it depends on.

| Phase | Contents |
|---|---|
| **1** | Project scaffold, Prisma schema, auth, `User`/`Role`/`Department`, RBAC + `authorize()`, audit log, admin user management, Manager role split. |
| **2** | `Customer` (sender/receiver), `Cargo`, `CargoPackage`, shipping marks, China receiving, photos, **Delivery Note** (print + PDF). |
| **3** | `Container`, loading, `ContainerCargo`, **Packing List**, **CBM engine + override audit**, `Shipment` (vessel/voyage/line/ports/seal), milestones. |
| **4** | Dar receiving, verification, China-vs-Dar variance, `ExceptionCase` + Manager supervision. |
| **5** | `ShippingRate`, customer pricing, `ExchangeRate` pinning, VAT, `Invoice`, `Payment` + verification, `Receipt`, derived balances, `ContainerExpense`. |
| **6** | Release authorisation engine, collection, delivery requests, notifications. |
| **7** | Public website (EN/SW), registration, **customer portal**, tracking, CBM calculator, published rates, booking/pickup/quote, schedule. |
| **8** | Customer Support inbox + customer-context panel, Manager dashboards, reports, global search, performance. |

Release control (phase 6) deliberately lands *before* the customer portal, so the
portal never shows a customer a "collect now" that the warehouse would refuse.

---

## 9. The rules this system inherits

Carried from Target Express because they were learned the hard way on a live
business, and they are not air-cargo-specific:

1. Every `"use server"` export calls `authorize()` itself.
2. Money is derived, never stored. There is no balance column.
3. The ledger is append-only; a wrong line gets a reversing line.
4. The session says who; the database says what they may do.
5. Document numbers come from `Counter`, inside the transaction.
6. Public output is an allow-list, never an omission.
7. Rates live in the database; historical documents keep the rate they used.
8. Every state change is appended, never mutated.
