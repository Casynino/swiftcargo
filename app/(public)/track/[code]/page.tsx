import Link from "next/link";
import type { Metadata } from "next";
import {
  Anchor,
  Boxes,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  PackageCheck,
  Receipt,
  Ship,
  Wallet,
  Warehouse,
  Waves,
} from "lucide-react";

import { CargoPhotos } from "@/components/site/cargo-photos";
import { TrackHero } from "@/components/site/track-hero";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { clientAddress, hit } from "@/lib/rate-limit";
import { whatsappLink, WHATSAPP_OPENER } from "@/lib/site-contact";
import { SHARE_CARD_TEXT } from "@/lib/share-card-text";
import {
  referenceFromInput,
  trackByReference,
  type PublicTracking,
} from "@/lib/tracking";
import type { StageKey } from "@/lib/tracking-stage";
import { cn } from "@/lib/utils";

/* One customer's cargo: never cached, never indexed. A cached page is
   yesterday's ETA and, now, somebody else's amount due. */
export const dynamic = "force-dynamic";

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The card WhatsApp draws when this link is pasted into a chat.
 *
 * WhatsApp renders it on their servers and shows it to everybody in the group
 * the link was pasted into, so no reference, no name and no figure belongs on
 * it — whatever this page is allowed to show the person who actually opens it.
 * What goes out is what the business sells. The page itself stays unindexed.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const reference = referenceFromInput(safeDecode(code));
  return {
    /* The browser tab is the one place the reference helps: it is the reader's
       own tab, not a card in somebody else's group chat. */
    title: reference
      ? `${t(DEFAULT_LOCALE, "Track")} ${reference}`
      : t(DEFAULT_LOCALE, "Track your cargo"),
    description: SHARE_CARD_TEXT.description,
    openGraph: {
      type: "website",
      title: SHARE_CARD_TEXT.title,
      description: SHARE_CARD_TEXT.description,
    },
    twitter: {
      card: "summary_large_image",
      title: SHARE_CARD_TEXT.title,
      description: SHARE_CARD_TEXT.description,
    },
    robots: { index: false, follow: false },
  };
}

/*
  HOW OFTEN ONE ADDRESS MAY LOOK SOMETHING UP.

  The page publishes the bill and the counter photographs now, so walking the
  sequence is worth more than it was and the allowance is tighter for it: enough
  for an office checking a customer's consignments over the telephone, far too
  slow to read four thousand references. The short window on top catches the
  shape a script has and a person does not — ten lookups in a minute is somebody
  typing, sixty is somebody counting.

  It is a floor and not a wall, and it is meant to be: see lib/rate-limit.ts,
  where the counts live in one server's memory. Set too low it stops the owner
  checking his own consignments before it stops anybody else.
*/
const LOOKUPS_PER_WINDOW = 30;
const WINDOW_MS = 10 * 60 * 1000;
const BURST = 10;
const BURST_MS = 60 * 1000;

/* The outline button carries no colour of its own, so on the ink field it
   inherits the white text around it and disappears into its own white face. */
const ON_INK = "border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white";

const TONE_PILL: Record<string, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  progress: "bg-brand/10 text-brand",
  good: "bg-success/10 text-success",
  warn: "bg-warning/10 text-warning",
  bad: "bg-destructive/10 text-destructive",
};

const STEP_ICON: Record<StageKey, typeof Ship> = {
  RECEIVED_CHINA: Warehouse,
  LOADED: Boxes,
  DEPARTED: Ship,
  AT_SEA: Waves,
  ARRIVED_DAR: Anchor,
  RECEIVED_DAR: MapPin,
  INVOICED: Receipt,
  READY: PackageCheck,
  HANDED_OVER: Check,
};

/** "27,000" — grouped for reading. Nothing is rounded or converted here. */
function grouped(value: string) {
  const [whole, frac] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? `.${frac}` : ""}`;
}

const dayMonthYear = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Dar_es_Salaam",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(value))
    : "—";

export default async function TrackResultPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const locale = DEFAULT_LOCALE;
  const { code } = await params;
  const reference = referenceFromInput(safeDecode(code));

  if (!reference) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t(locale, "That is not a tracking reference")}
        </h1>
        <p className="mt-3 text-white/60">
          {t(
            locale,
            "Your reference is on your delivery note and on every box label. It looks like SC0125."
          )}
        </p>
      </Shell>
    );
  }

  const address = await clientAddress();
  const steady = hit(`track:${address}`, LOOKUPS_PER_WINDOW, WINDOW_MS);
  const burst = hit(`track-burst:${address}`, BURST, BURST_MS);
  if (!steady.ok || !burst.ok) {
    return (
      <Shell reference={reference}>
        <Clock className="size-8 text-white/50" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {t(locale, "Too many lookups")}
        </h1>
        <p className="mt-3 text-white/60">
          {t(
            locale,
            "Please wait a few minutes and try again, or sign in to see all of your cargo at once."
          )}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/login?callbackUrl=%2Fportal">{t(locale, "Sign in")}</Link>
          </Button>
          <Button asChild variant="outline" className={ON_INK}>
            <Link href="/contact">{t(locale, "Contact us")}</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const result = await trackByReference(reference);

  if (!result) {
    return (
      <Shell reference={reference}>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t(locale, "We cannot find")}{" "}
          <span className="tnum font-mono">{reference}</span>
        </h1>
        <p className="mt-3 text-white/60">
          {t(
            locale,
            "Check the reference on your delivery note or box label. If your goods were only received today they may not be on the system yet."
          )}
        </p>
        <p className="mt-2 text-sm text-white/45">
          {t(
            locale,
            "Shipping marks cannot be tracked here. Sign in to see everything under your mark."
          )}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild variant="outline" className={ON_INK}>
            <Link href="/login?callbackUrl=%2Fportal">{t(locale, "Sign in")}</Link>
          </Button>
          <Button asChild>
            <Link href="/contact">{t(locale, "Ask us instead")}</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <>
      <TrackHero reference={result.reference} />
      <Backdrop>
        <TrackingCard result={result} />
      </Backdrop>
    </>
  );
}

function TrackingCard({ result }: { result: PublicTracking }) {
  const locale = DEFAULT_LOCALE;
  const { journey, charge, storage } = result;
  /* Opens with the greeting already in the box, so the customer presses send
     once and says the rest in their own words. See lib/site-contact.ts. */
  const wa = whatsappLink(result.whatsapp, WHATSAPP_OPENER);
  const settled = charge?.status === "PAID";
  const ready = journey.headline === "Ready for collection";

  const facts: { label: string; value: string }[] = [
    { label: "Cargo", value: result.description },
    { label: "Shipper", value: result.shipperInitials },
    { label: "Volume", value: result.cbm ? `${result.cbm} CBM` : "—" },
    { label: "Counted as", value: result.countedAs },
    { label: "Route", value: `${result.origin} → ${result.destination}` },
    { label: "Now at", value: result.location },
    {
      label: "Container",
      value: result.containerReference ?? t(locale, "Not yet loaded"),
    },
    { label: "Received in China", value: dayMonthYear(result.receivedInChinaAt) },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-raised">
      {/* CARGO, the reference, and one word for how far it has got. */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-6">
        <div className="min-w-0">
          <p className="eyebrow text-muted-foreground">{t(locale, "Cargo")}</p>
          <p className="tnum mt-1 break-all font-mono text-[30px] font-semibold leading-none">
            {result.reference}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium",
            TONE_PILL[journey.tone] ?? TONE_PILL.neutral
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {t(locale, journey.headline)}
        </span>
      </div>

      {/*
        THE WAREHOUSE CLOCK, SAID BEFORE ANYBODY IS BILLED FOR IT.

        A customer should never be surprised by a storage charge, so this appears
        the day the boxes land — not when the free week runs out, and not when an
        invoice arrives. While the week is running it is a countdown and a reason
        to come; once it has run out it is a running total and a better one.
      */}
      {storage ? (
        <section className="border-b">
          <p className="eyebrow border-b bg-muted/30 px-5 py-2.5 text-muted-foreground">
            {t(locale, "Warehouse storage")}
          </p>
          <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            <Cell label={t(locale, "Arrived")} value={dayMonthYear(storage.arrivedAt)} />
            <Cell
              label={t(locale, "Days in warehouse")}
              value={`${storage.daysInWarehouse} ${
                storage.daysInWarehouse === 1 ? t(locale, "day") : t(locale, "days")
              }`}
            />
            {storage.collected ? (
              <Cell
                label={t(locale, "Status")}
                value={t(locale, "Collected — the clock has stopped")}
              />
            ) : storage.chargeableDays > 0 ? (
              <Cell
                label={t(locale, "Days overdue")}
                value={`${storage.chargeableDays} ${
                  storage.chargeableDays === 1 ? t(locale, "day") : t(locale, "days")
                }`}
                tone="text-destructive"
              />
            ) : (
              <Cell
                label={t(locale, "Free storage remaining")}
                value={`${storage.freeDaysRemaining} ${
                  storage.freeDaysRemaining === 1 ? t(locale, "day") : t(locale, "days")
                }`}
              />
            )}
            <Cell
              label={t(locale, "Charged so far")}
              value={
                storage.chargeTzs !== null
                  ? `TSh ${grouped(storage.chargeTzs)}`
                  : `${storage.currency} ${grouped(storage.charge)}`
              }
              sub={
                storage.chargeTzs !== null
                  ? `${storage.currency} ${grouped(storage.charge)}`
                  : null
              }
              tone={Number(storage.charge) > 0 ? "text-destructive" : undefined}
            />
          </dl>
          {!storage.collected && storage.charged ? (
            <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
              {storage.chargeableDays > 0
                ? `${t(locale, "Storage is charged at")} ${storage.currency} ${storage.perDay} ${t(locale, "a day until the cargo is collected.")}`
                : `${t(locale, "The first")} ${storage.freeDays} ${t(locale, "days are free. After that storage is")} ${storage.currency} ${storage.perDay} ${t(locale, "a day until it is collected.")}`}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* The consignment itself: eight facts, two rows of four. */}
      <dl className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0 bg-card p-5">
            <dt className="text-xs text-muted-foreground">{t(locale, fact.label)}</dt>
            <dd className="mt-1 break-words text-sm font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {/* The promised date, and a word about where the boxes actually are —
          made of this consignment's own dates and counts, so no two customers
          read the same sentence. */}
      <dl className="grid grid-cols-1 gap-px border-b bg-border sm:grid-cols-4">
        <div className="bg-card p-5">
          <dt className="text-xs text-muted-foreground">
            {result.expectedInDarAt
              ? t(locale, "Expected in Dar")
              : t(locale, "Arrived in Dar")}
          </dt>
          <dd className="mt-1 text-sm font-medium">
            {dayMonthYear(result.expectedInDarAt ?? result.arrivedInDarAt)}
          </dd>
        </div>
        <div className="flex items-start gap-3 bg-card p-5 sm:col-span-3">
          <Ship className="mt-0.5 size-4 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{result.note.sw}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{result.note.en}</p>
          </div>
        </div>
      </dl>

      {/* Proof of condition, taken at our counter. The handover photograph is
          deliberately not here: it has somebody's face in it. */}
      {result.photos.length > 0 ? (
        <div className="border-b p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="size-4 text-brand" />
            {t(locale, "Picture of your cargo")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(locale, "Tap to view and download.")}
          </p>
          <CargoPhotos
            reference={result.reference}
            photos={result.photos.map((photo) => ({
              ...photo,
              /* The reference is what opens the file without a session — see
                 lib/file-access.ts. */
              url: `${photo.url}?ref=${encodeURIComponent(result.reference)}`,
            }))}
          />
        </div>
      ) : null}

      {charge ? (
        <section className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-6 p-6">
            {/* The lines take the width the card has. A column sized to its own
                longest line leaves the bill huddled against the left edge of a
                card two thirds empty. */}
            <div className="min-w-0 flex-1 basis-[20rem]">
              <p className="eyebrow flex items-center gap-1.5 text-muted-foreground">
                <Wallet className="size-3.5" />
                {/* "Settled in full", not "Total paid": a bill whose last
                    shillings were written off at the counter was never paid in
                    that amount, and either way nothing is owed. */}
                {settled ? t(locale, "Settled in full") : t(locale, "Amount due")}
              </p>

              {/*
                SHILLINGS LEAD, DOLLARS UNDERNEATH.

                This is the figure a customer acts on, and they pay it in
                shillings — at a lipa number, in a bank hall, in cash at the
                counter. Leading in dollars asks every customer to convert in
                their head, at whatever rate they remember, to answer a question
                about their own money. The dollar line stays because the bill is
                raised in dollars and they may be holding one.
              */}
              {(settled ? charge.totalTzs : charge.outstandingTzs) !== null ? (
                <>
                  <p className="tnum mt-1 text-[32px] font-bold leading-none">
                    <span className="mr-1.5 text-xl font-bold opacity-70">TSh</span>
                    {grouped((settled ? charge.totalTzs : charge.outstandingTzs)!)}
                  </p>
                  <p className="tnum mt-2 font-mono text-sm text-muted-foreground">
                    {charge.currency} {grouped(settled ? charge.total : charge.outstanding)}{" "}
                    {t(locale, "on the invoice")}
                  </p>
                </>
              ) : (
                /* No rate pinned on the bill, so there is no honest shilling
                   figure to lead with. The dollar one is what exists. */
                <p className="tnum mt-1 text-[32px] font-bold leading-none">
                  {charge.currency} {grouped(settled ? charge.total : charge.outstanding)}
                </p>
              )}

              <p className="tnum mt-1 font-mono text-xs text-muted-foreground">
                {t(locale, "Invoice")} {charge.invoiceNumber}
              </p>

              {/* How the figure was reached. Read off the invoice, never
                  recomputed — a second opinion about what somebody owes is the
                  first thing to disagree with the bill. */}
              {charge.lines.length > 0 ? (
                <dl className="mt-4 space-y-1.5 border-t pt-3 text-sm">
                  {charge.lines.map((line) => (
                    <div key={line.label} className="flex justify-between gap-4">
                      <dt className="min-w-0 text-muted-foreground">
                        {line.label}
                        {line.note ? (
                          <span className="block font-mono text-[11px] text-muted-foreground/70">
                            {line.note}
                          </span>
                        ) : null}
                      </dt>
                      <dd className="tnum shrink-0 font-mono">
                        {charge.currency} {grouped(line.amount)}
                      </dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 border-t pt-1.5 font-medium">
                    <dt>{t(locale, "Jumla")}</dt>
                    <dd className="tnum font-mono">
                      {charge.currency} {grouped(charge.total)}
                    </dd>
                  </div>
                  {charge.rate ? (
                    /* The invoice's own pinned rate. Never today's: a bill
                       agreed at 2,650 is still 2,650 after the board moves. */
                    <div className="flex justify-between gap-4 text-xs text-muted-foreground">
                      <dt>{t(locale, "Rate iliyotumika")}</dt>
                      <dd className="tnum font-mono">
                        USD 1 = TZS {grouped(String(Math.round(Number(charge.rate))))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </div>

            <div className="min-w-[9rem]">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
                  settled
                    ? "bg-success/10 text-success"
                    : charge.status === "PART_PAID"
                      ? "bg-warning/10 text-warning"
                      : "bg-destructive/10 text-destructive"
                )}
              >
                {settled ? <CheckCircle2 className="size-4" /> : null}
                {settled
                  ? t(locale, "Paid")
                  : charge.status === "PART_PAID"
                    ? t(locale, "Partly paid")
                    : t(locale, "Not yet paid")}
              </span>
              {charge.status === "PART_PAID" ? (
                <p className="tnum mt-2 text-xs text-muted-foreground">
                  {charge.currency} {grouped(charge.paid)} {t(locale, "received of")}{" "}
                  {charge.currency} {grouped(charge.total)}.
                </p>
              ) : null}
            </div>
          </div>

          {/* Why collecting sooner is cheaper. Not a disclaimer bolted on the
              bottom — the reason to come today rather than next week. Swahili
              first, because that is who is reading. */}
          {storage && storage.charged && !storage.collected ? (
            <div className="mx-6 mb-6 space-y-2 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3">
              <p className="text-xs leading-relaxed text-foreground/90">
                Siku {storage.freeDays} za kwanza ni bure. Baada ya hapo, hifadhi ni{" "}
                {storage.currency} {storage.perDay} kwa siku hadi mzigo utakapochukuliwa.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t(locale, "The first")} {storage.freeDays}{" "}
                {t(locale, "days are free. After that storage is")} {storage.currency}{" "}
                {storage.perDay}{" "}
                {t(locale, "a day until it is collected. Collecting sooner costs less.")}
              </p>
            </div>
          ) : null}

          {/* Where to send it. Read from the bill's own copy of the accounts
              where it kept one, so an account edited since cannot redraw a bill
              the customer is holding. Hidden once it is settled: nobody needs an
              account number for money they have already sent. */}
          {!settled && result.accounts.length > 0 ? (
            <div className="mx-6 mb-6 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-semibold">Njia za malipo</p>
              <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {result.accounts.map((account) => (
                  <li
                    key={`${account.bankName}-${account.accountNumber}`}
                    className="rounded-lg border bg-card p-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {account.bankName}
                      {account.kind === "MOBILE_MONEY"
                        ? ` — ${t(locale, "Lipa number")}`
                        : ` — ${account.currency}`}
                    </p>
                    <p className="tnum mt-0.5 font-mono text-base font-semibold">
                      {account.accountNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.accountName}
                      {account.branch ? ` · ${account.branch}` : ""}
                    </p>
                  </li>
                ))}
                {/* The cash tin is not an account anybody transfers into, so it
                    is not in the snapshot — it is still where a good half of
                    Kariakoo pays, so it is named as a place rather than a
                    number. */}
                {result.officeAddress ? (
                  <li className="rounded-lg border bg-card p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(locale, "Cash — at our office")}
                    </p>
                    <p className="mt-0.5 text-sm font-medium">{result.officeAddress}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(locale, "Pay at the counter when you collect.")}
                    </p>
                  </li>
                ) : null}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Tafadhali tumia{" "}
                <span className="font-mono font-medium text-foreground">
                  {result.reference}
                </span>{" "}
                kama kumbukumbu ya malipo. Baada ya kulipa, tuma uthibitisho kwa{" "}
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand hover:underline"
                  >
                    WhatsApp {result.whatsappLabel}
                  </a>
                ) : (
                  <span className="font-medium">WhatsApp</span>
                )}
                .
              </p>
            </div>
          ) : null}
        </section>
      ) : (
        <div className="border-b bg-muted/30 p-5 text-sm text-muted-foreground">
          <p>{t(locale, "There is nothing to pay on this consignment yet.")}</p>
          <p className="mt-1 text-xs">
            {t(
              locale,
              "Your invoice is raised once the cargo is checked in at our Dar es Salaam warehouse."
            )}
          </p>
        </div>
      )}

      {/* One line saying what happens next. */}
      <div
        className={cn(
          "flex items-start gap-3 border-b p-5 text-sm",
          ready ? "bg-success/5 text-success" : "bg-muted/30 text-muted-foreground"
        )}
      >
        {ready ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        ) : (
          <Boxes className="mt-0.5 size-4 shrink-0" />
        )}
        <p>
          {ready
            ? t(
                locale,
                "Everything is settled. Bring your ID and this reference to our Dar es Salaam warehouse."
              )
            : charge && charge.status !== "PAID"
              ? t(locale, "We release cargo once payment is confirmed.")
              : t(locale, journey.headline)}
        </p>
      </div>

      <div className="p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4 text-brand" />
          {t(locale, "Cargo timeline")}
        </h2>
        <Timeline result={result} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 p-5 text-xs text-muted-foreground">
        <span>
          {result.origin} → {result.destination} ·{" "}
          {result.service === "FCL"
            ? t(locale, "Full container")
            : t(locale, "Loose cargo")}
          {result.vessel ? ` · ${result.vessel}` : ""}
        </span>
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-brand"
          >
            <MessageCircle className="size-3.5" />
            {t(locale, "Ask about this cargo")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The rail.
 *
 * Drawn on the server, dates and all: a timestamp formatted in the browser
 * would come out in the visitor's own locale and not match the markup the
 * server sent.
 */
function Timeline({ result }: { result: PublicTracking }) {
  const locale = DEFAULT_LOCALE;
  const steps = result.journey.steps;

  return (
    <ol className="relative mt-4">
      {steps.map((step, index) => {
        const Icon = STEP_ICON[step.key] ?? MapPin;
        const active = step.state !== "upcoming";
        return (
          <li key={step.key} className="relative flex gap-4 pb-7 last:pb-0">
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5",
                  step.state === "done" ? "bg-brand" : "bg-border"
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                step.state === "current"
                  ? "border-brand bg-brand text-brand-foreground shadow-[0_0_0_4px_hsl(var(--brand)/0.15)]"
                  : step.state === "done"
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border bg-background text-muted-foreground/50"
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {t(locale, step.label)}
                {step.state === "current" ? (
                  <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                    {t(locale, "now")}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {stepPlace(step.key, result)}
              </p>
              {step.detail || step.at ? (
                <p className="tnum mt-0.5 text-xs text-muted-foreground/80">
                  {step.detail ? t(locale, step.detail) : null}
                  {step.detail && step.at ? " · " : null}
                  {step.at
                    ? step.key === "AT_SEA"
                      ? formatDate(step.at)
                      : formatDateTime(step.at)
                    : null}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Where each step happens, in the words the rest of the page uses. */
function stepPlace(key: StageKey, result: PublicTracking): string {
  switch (key) {
    case "RECEIVED_CHINA":
    case "LOADED":
    case "DEPARTED":
      return `${result.origin}, China`;
    case "AT_SEA":
      return result.vessel ?? "At sea";
    case "ARRIVED_DAR":
      return `${result.destination} port`;
    case "RECEIVED_DAR":
    case "READY":
    case "HANDED_OVER":
      return `${result.destination} warehouse`;
    case "INVOICED":
      return "Swift Cargo";
  }
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | null;
  tone?: string;
}) {
  return (
    <div className="min-w-0 bg-card px-5 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("mt-0.5 text-base font-semibold", tone)}>{value}</dd>
      {sub ? (
        <dd className="tnum mt-0.5 font-mono text-[11px] text-muted-foreground">{sub}</dd>
      ) : null}
    </div>
  );
}

/* One column on the ink field, carrying on from the hero above it rather than
   starting a new page. Wider and the eight facts stop reading as two rows of
   four; narrower and the bill's lines begin to wrap. */
function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden bg-ink py-10 sm:py-14">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_-10%,hsl(var(--marine)/0.22),transparent_60%),radial-gradient(ellipse_at_5%_110%,hsl(var(--signal)/0.16),transparent_58%)]"
      />
      <div className="container relative max-w-[860px]">{children}</div>
    </section>
  );
}

/* Nothing found, or nothing askable. The hero keeps the box they typed into,
   so these states say what went wrong and leave the retry where it was. */
function Shell({
  children,
  reference,
}: {
  children: React.ReactNode;
  reference?: string;
}) {
  return (
    <>
      <TrackHero reference={reference} />
      <Backdrop>
        <div className="mx-auto max-w-xl text-white">{children}</div>
      </Backdrop>
    </>
  );
}
