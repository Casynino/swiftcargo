# Swift Cargo — the production database

Neon PostgreSQL, Prisma 6, the app on Vercel. This covers setting the database
up, changing its schema, seeding it and keeping it safe.

## 1. Neon

1. Create a project in the region closest to the Vercel functions (the app's
   Vercel region and the Neon region should match; every page makes several
   round trips).
2. Create the database `swiftcargo` on the default branch (`main`). Leave
   Postgres at the Neon default version.
3. From **Connect**, copy two connection strings for the same role:
   - **Pooled**: the host contains `-pooler`. This is `DATABASE_URL`.
   - **Direct**: the same host without `-pooler`. This is `DIRECT_URL`.

```
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/swiftcargo?sslmode=require&pgbouncer=true&connection_limit=5&pool_timeout=20"
DIRECT_URL="postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/swiftcargo?sslmode=require"
```

Why two:

- The app connects via the **pooler** (PgBouncer, transaction mode). Every
  Vercel instance holds its own Prisma client, and without a pooler a busy hour
  opens more connections than the compute allows. `pgbouncer=true` switches
  off prepared-statement caching, which transaction pooling cannot carry.
  `connection_limit=5` caps each instance: the dashboards run their queries in
  parallel, so 1 queues them, and much more multiplies across instances.
  Interactive transactions (every document number, every payment) work through
  the pooler, because a transaction keeps its connection until it ends.
- **Migrations** go through the **direct** address. Prisma Migrate takes an
  advisory lock and runs DDL, and PgBouncer in transaction mode cannot do that.
  `schema.prisma` already says `directUrl = env("DIRECT_URL")`.

Set both in Vercel → Project → Settings → Environment Variables for
**Production**. Give **Preview** a Neon *branch* of its own, never the
production connection strings: a preview deploy runs `migrate deploy` too.

Local development uses the same two variables pointing at the same local
database (see `.env.example`).

## 2. Schema changes: migrations, not `db push`

The schema is versioned in `prisma/migrations/`:

| Migration | What it is |
|---|---|
| `0001_init` | Baseline: the schema as it stood when the project moved off `db push`. |
| `0002_restrict_evidence_and_indexes` | History, receivings, photos, expenses, proofs and notes become `ON DELETE RESTRICT`; `Invoice.containerCargoId` becomes a real foreign key; indexes for the hot queries. |

### Developing a change

```bash
# edit prisma/schema.prisma, then:
npm run db:migrate -- --name what_changed   # prisma migrate dev: writes the SQL, applies it locally, regenerates the client
```

Commit the new folder under `prisma/migrations/` with the schema change. Never
edit a migration that has already been applied anywhere; write a new one.
`npm run db:push` is gone on purpose: a pushed change has no migration, and
production never gets it.

To check that the migrations still rebuild the schema exactly:

```bash
createdb swiftcargo_shadow
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://…/swiftcargo_shadow" --exit-code   # "No difference detected."
dropdb swiftcargo_shadow
```

### Deploying

```bash
npm run db:migrate:deploy    # prisma migrate deploy, over DIRECT_URL
```

Run it **before** the new code serves traffic. On Vercel, the build command is
`npm run vercel-build` (`prisma generate && prisma migrate deploy && next build`;
see docs/DEPLOY.md). `migrate deploy` only applies pending migrations in order. It never
resets, never drops data it wasn't told to, and never needs a shadow database.

`npm run db:migrate:status` shows what is applied.

### An existing database that was built with `db push`

A local database from before migrations already has every table from
`0001_init`. Mark the baseline as applied instead of running it, then deploy
the rest:

```bash
npx prisma migrate resolve --applied 0001_init
npx prisma migrate deploy
```

## 3. The first seed

```bash
ADMIN_EMAIL="owner@company.co.tz" \
ADMIN_PASSWORD="…" \
npm run db:seed:production
```

`prisma/seed.production.ts` writes only what the business cannot operate
without and has no screen to create:

- **Company settings.** Name, phones, addresses, legal entities, VAT 18%, 7
  free storage days, invoice terms. Review them at `/app/admin/settings`.
  `COMPANY_EMAIL`, `COMPANY_PHONE`, `COMPANY_WHATSAPP`, `COMPANY_TIN` and
  `COMPANY_VRN` override the defaults.
- **Warehouses.** Guangzhou (`GZ`) and Dar es Salaam (`DAR`).
- **One administrator** from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (`ADMIN_NAME`
  optional). The password needs at least 12 characters, with upper case, lower
  case, a digit and a symbol. A known or email-derived password is refused. If
  the account already exists, its password is **not** changed.
- **Exchange rate.** 1 USD = 2,700 TZS, only if no rate is live.
- **Expense categories.** The sixteen container and office categories.
- **Markets directory.** Public website content. Only adds missing slugs. Set
  `SEED_MARKETS=false` to skip it.
- **Rate book (opt-in, `SEED_RATE_BOOK=true`).** The per-cargo-type LCL rates
  from the old system (`prisma/data/rate-book.ts`), only for types with no
  live rate. **Finance must confirm the figures first.** In particular,
  *Bolt & Nuts* is listed at USD 450 **per kg**, which is almost certainly a
  per-CBM or per-tonne figure carried over wrongly.

Every write is recorded in `AuditLog` with actor `seed.production`. It writes
no customers, cargo, invoices, payments or `Counter` rows, so the first real
document on the live system is number 000001. It is safe to run again. After
the first run, remove `ADMIN_PASSWORD` from the environment.

After seeding, the administrator:

1. Creates staff accounts at `/app/admin/users`.
2. Adds the collection accounts (bank, mobile money, cash) under Finance →
   Accounts. Invoices print these, so bills cannot be raised usefully until
   they exist.
3. Confirms or publishes the rate book under Finance → Rates.

### Development data never reaches production

`prisma/seed.ts` (shared staff password) and everything in `prisma/dev/` (demo
customers, cargo, bills, payments) call `refuseProductionDatabase()` from
`prisma/dev/guard.ts` first. They exit without writing when
`NODE_ENV=production`, or when `DATABASE_URL` / `DIRECT_URL` points at Neon or
another hosted Postgres. `prisma migrate reset` (`npm run db:reset`) runs
`prisma/seed.ts`, so it cannot seed a hosted database either. **Never run
`migrate reset` or `migrate dev` against production.** Both are allowed to drop
the database.

`scripts/currency-backfill.ts` is safe on production (idempotent, it only
fills missing shilling values). `scripts/seed-markets.ts` is the same markets
step as the production seed.

## 4. Backups and recovery

- **Point-in-time restore.** Neon keeps history for the project's restore
  window (the plan decides how long; set it to at least 7 days for a live
  business). Recovery is a new branch *as of* a timestamp. Check it, then
  point `DATABASE_URL`/`DIRECT_URL` at it or restore it into `main`.
- **Before every migration on production**, create a Neon branch named
  `pre-<migration-name>`. It is instant and copy-on-write, and it is the
  rollback. Delete it once the release has run cleanly for a few days.
- **Off-site copy.** A nightly logical dump kept outside Neon covers losing the
  account itself:

  ```bash
  pg_dump "$DIRECT_URL" -Fc -f swiftcargo-$(date +%F).dump    # restore: pg_restore --no-owner -d <url> file.dump
  ```

  Use the direct URL (not the pooler) and the same major version of `pg_dump`
  as the server. Keep 30 daily and 12 monthly dumps. Restore one into a scratch
  database every quarter, because a backup nobody has restored is a hope.
- Uploaded photos and payment proofs are not in the database, so back up their
  storage separately.

## 5. What the schema guarantees

- **Money is Decimal everywhere.** There is no Float column and no balance
  column. `Receipt.balanceAfter` is the figure printed on that receipt at the
  moment of issue (a document snapshot), and nothing reads it back as a
  balance. `BankAccount.openingBalance` is the fact typed in when the account
  was opened. Current balances are derived.
- **Uniqueness the code relies on.** Document numbers (`Cargo.reference`,
  `Invoice.number`, `Payment.reference`, `Receipt.number`, `Release.number`,
  `PickupNote.noteNumber`, `PackingList.number`, `DeliveryNote.number`, …),
  `Payment.idempotencyKey` (double-submit), `Invoice.containerCargoId` (one live
  bill per sailing, released when a bill is cancelled), one `ChinaReceiving` /
  `DarReceiving` / `Release` / `PickupNote` per cargo, one receipt per payment,
  `PayrollRun (year, month)`, `Customer.shippingMark`, and QR tokens.
- **Nothing that is evidence or money cascades away.** Cargo, containers,
  customers and payments are soft-deleted. A hard delete of a parent with
  history fails with a foreign-key error (P2003) instead of silently removing
  timelines, receivings, photos, expenses, proofs or conversations.
  `tests/schema-db.test.ts` checks this.
- **Not enforced by the database, on purpose.** `paperReceiptNo` is not unique
  (paper books get reprinted). `Payment.transactionRef` is not unique (one bank
  transfer can settle several bills).

## 6. Performance notes

Indexes follow the queries: foreign keys that are filtered on, `status` +
`deletedAt`, date windows (`receivedAt`, `releasedAt`, `issuedAt`, `paidAt`,
`verifiedAt`), `AuditLog (entity, entityId, createdAt)`, and the "newest
container line per cargo" subquery `ContainerCargo (cargoId, createdAt)`.

The finance views (`loadBooks`, `accountRegister`, `ledgerRows`,
`managerOverview`, `moneyPosition`, `financeDesk`) read every live bill,
verified payment and expense and add them up in the app. That is what keeps
every figure derived and every screen in agreement. It is comfortable into
tens of thousands of bills. Past that, the next step is to bound these reads by
period, or to aggregate in SQL. Watch Neon's slow query view (`pg_stat_statements`)
for them first.

Customer, cargo and invoice search use case-insensitive `contains` (`ILIKE
'%…%'`), which no B-tree index serves. If search slows down, add `pg_trgm` GIN
indexes on `Customer.fullName/phone`, `Cargo.reference/shippingMark` and
`Invoice.number` (Neon supports the extension; Prisma needs the
`postgresqlExtensions` preview feature to declare it).
