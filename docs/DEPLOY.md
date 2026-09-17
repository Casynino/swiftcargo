# Swift Cargo — deploying to Vercel and Neon

The app runs on Vercel (Next.js 15, Node functions), the database on Neon
PostgreSQL, and uploaded files in a private Vercel Blob store. This is the
whole procedure, in order. The database side is covered in more depth in
`docs/DEPLOY-DATABASE.md`; read its sections 1 and 3 alongside steps 1 and 6
here.

## 1. Neon

1. Create a Neon project. Pick the region the Vercel functions will run in
   (for Tanzania, AWS `eu-central-1` Frankfurt pairs with Vercel `fra1`).
2. Create the database `swiftcargo`.
3. From **Connect**, copy both strings for the same role:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL`, with
     `?sslmode=require&pgbouncer=true&connection_limit=5&pool_timeout=20`
   - **Direct** (same host without `-pooler`) → `DIRECT_URL`, with
     `?sslmode=require`
4. For previews, create a Neon **branch** (e.g. `preview`) and keep its two
   strings for step 4. A preview deploy runs `prisma migrate deploy` too, so it
   must never hold the production strings.

## 2. Vercel project

Import the repository. Under **Settings → General / Build & Development**:

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Build command | `npm run vercel-build` |
| Install command | `npm install` (default; `postinstall` runs `prisma generate`) |
| Output directory | default |
| Node.js version | 22.x |
| Function region (Settings → Functions) | the Neon region, e.g. `fra1` |

`npm run vercel-build` is `prisma generate && prisma migrate deploy && next build`.
Migrations are applied before the new build can serve traffic; `migrate deploy`
only applies pending migrations and never resets anything. It connects over
`DIRECT_URL`, so that variable must be available to the **build**, not only at
runtime (Vercel exposes project variables to builds by default).

The build also prerenders the public pages (home, rates, calculator, schedule),
which read the database, so the database must be reachable during the build.

No `vercel.json` is needed. The PDF and export routes declare
`runtime = "nodejs"` and `maxDuration = 60` themselves, and the app has no
scheduled jobs: overdue bills, storage days and balances are all computed when
they are read.

## 3. Blob store (uploaded files)

1. **Storage → Create → Blob**. Choose **Private** access. Connect it to the
   project for Production (and a separate store for Preview).
2. Connecting it adds `BLOB_READ_WRITE_TOKEN` to the project.

With the token set, `lib/storage.ts` writes to the store under
`uploads/<folder>/<name>` with `access: "private"` and no random suffix; the
record keeps `/uploads/<folder>/<name>` as before. Nothing is served from the
store directly: `/uploads/...` is rewritten to `/api/files/...`, which checks
who is asking (`lib/file-access.ts`) and then streams the blob server-side with
the token. Without the token the app writes to local disk, which on Vercel is
lost after the request — a production server on Vercel refuses to start without
it.

Do not use a public store. A public blob is readable by anyone who has its URL,
and these are payment slips and signatures.

## 4. Environment variables

Settings → Environment Variables. Everything the code reads is listed in
`.env.example`. On a production server, `instrumentation.ts` runs
`lib/env.ts` at start-up and stops with a list of what is missing.

| Variable | Production | Preview | Notes |
|---|---|---|---|
| `DATABASE_URL` | Neon pooled (main) | Neon pooled (preview branch) | required |
| `DIRECT_URL` | Neon direct (main) | Neon direct (preview branch) | required by the build (`migrate deploy`) |
| `AUTH_SECRET` | `openssl rand -base64 32` | a different value | required, 32+ characters |
| `NEXT_PUBLIC_SITE_URL` | `https://swiftcargo.co.tz` | the preview domain | required, https, not localhost; built into the bundle, so redeploy after changing it. It is inside every QR code on labels and pickup notes. |
| `BLOB_READ_WRITE_TOKEN` | from the Production store | from the Preview store | required on Vercel |
| `AUTH_TRUST_HOST` | `true` | `true` | optional; `auth.config.ts` already trusts the host |

Never set in production: `SEED_ADMIN_PASSWORD` (development seed only; the
server logs a warning if it is present). `ADMIN_EMAIL` / `ADMIN_PASSWORD` are
only for the one-off seed in step 6 and should not be stored in Vercel at all.
`VERCEL`, `VERCEL_PROJECT_PRODUCTION_URL` and `NODE_ENV` are set by Vercel.

## 5. First deploy

Deploy (push to the production branch, or **Deployments → Redeploy**). In the
build log, confirm:

- `prisma migrate deploy` lists `0001_init` and
  `0002_restrict_evidence_and_indexes` as applied (or "No pending migrations").
- `next build` finishes with the route table.

If a function log shows `The server environment is incomplete`, the listed
variables are missing; set them and redeploy.

## 6. Seed the live database, once

From a trusted machine with the repository checked out and `npm install` done,
pointing at the **production** Neon strings:

```bash
DATABASE_URL="<pooled>" DIRECT_URL="<direct>" \
ADMIN_EMAIL="owner@swiftcargo.co.tz" ADMIN_PASSWORD="<12+ chars, mixed>" \
npm run db:seed:production
```

It writes company settings, the two warehouses, one administrator, an
exchange rate, expense categories and the markets directory. It is safe to run
again and never changes an existing password. Clear the variables from the
shell afterwards. The development seeds refuse to run against Neon.

Then, signed in as that administrator: review `/app/admin/settings`, create
staff accounts, add the collection accounts (Finance → Accounts), and publish
the rate book (Finance → Rates).

## 7. Domain

Settings → Domains → add `swiftcargo.co.tz` (and `www` redirecting to it).
Set the DNS records Vercel shows. Once the certificate is issued, make sure
`NEXT_PUBLIC_SITE_URL` is exactly that https address and redeploy — labels
printed before that carry whatever address was set.

## 8. Backups

- **Database**: Neon keeps point-in-time history for the plan's restore window.
  Check the window on the chosen plan, and before any risky change create a
  branch (a free instant copy). For an independent copy, schedule a nightly
  `pg_dump "$DIRECT_URL" -Fc` to storage outside Vercel and Neon.
- **Files**: the Blob store has no version history. Deleting from it is
  permanent; the app never deletes uploads. For an off-platform copy, a
  periodic job can `list()` the store and copy new blobs elsewhere.

## 9. Limits to know about

- **4.5 MB per request on Vercel.** A function request body cannot exceed it,
  whatever `serverActions.bodySizeLimit` says. `components/upload-budget.tsx`
  shrinks the larger photos in a form in the browser when a form's files add up
  to more than 4 MB, and refuses to send (with a message) if it still cannot fit.
  Photos under the budget are uploaded untouched. A single PDF larger than about
  4 MB (a thick scanned bill of lading) cannot be uploaded on Vercel; scan it at
  a lower resolution or split it. Self-hosted, the limit is 12 MB per file.
- **Rate limits on tracking and website forms** (`lib/rate-limit.ts`) are held in
  each function instance's memory, so on Vercel they are a floor per instance.
  The database-backed limits on forms and on sign-in hold across instances.
- **Middleware** runs on the edge and reads only the session token; every page
  and action re-checks the live user row. Build warnings about
  `CompressionStream` in `jose` from the edge bundle are expected and harmless.

## 10. Smoke test after every production deploy

Anonymous:

- [ ] `/`, `/rates`, `/calculator`, `/schedule`, `/track`, `/contact` load.
- [ ] `/robots.txt` and `/sitemap.xml` name the real domain, not localhost.
- [ ] `/app/dashboard` and `/portal` redirect to `/login?callbackUrl=...`.
- [ ] `/apple-icon.png`-style paths are not sent to `/login`.
- [ ] `/uploads/payments/anything.png` and `/api/files/..%2f.env` return 404.
- [ ] `/app/finance/invoices/x/pdf` redirects to `/login`.

Signed in (administrator, then one warehouse account):

- [ ] Dashboard renders for each desk; the warehouse account sees no prices.
- [ ] Upload a photo on a cargo record; it displays, and opening its
      `/uploads/...` address in a private window returns 404.
- [ ] Attach two full-size phone photos to one form; it submits (the browser
      shrinks them) and both display.
- [ ] Download an invoice PDF: it opens and shows the logo.
- [ ] Open a package label and scan its QR code with a phone: it opens
      `https://<your domain>/t/...`.
- [ ] Vercel → Logs: no `EnvironmentError`, no 500s.
