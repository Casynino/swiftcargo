import Link from "next/link";
import type { Metadata } from "next";
import { Download, FileText, PackageCheck } from "lucide-react";

import { TrackHero } from "@/components/site/track-hero";
import { mergedGroupByInvoiceIds } from "@/lib/merged-payment";
import { formatRate } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { trackKey, trackKeyValid } from "@/lib/track-key";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Your cargo, one bill",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/**
 * EVERY CONSIGNMENT ONE HANDOVER COVERS, IN ONE PLACE.
 *
 * Reached only from the signed link in a merged-payment WhatsApp message —
 * `mergedTrackLink()` — never from a guessed reference. A single cargo's own
 * tracking page is public by the owner's own decision (see lib/tracking.ts);
 * this page hands a stranger somebody's entire list of consignments and their
 * combined total, which is not that decision, so it stays behind the key.
 *
 * Read live off the invoices, same as the notification that linked here: sent
 * before payment, it says what is owed; opened again after, it says what was
 * paid. Every cargo on it still opens its own tracking page — this is a
 * summary of the group, not a second place its status is kept.
 */
export default async function MergedGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { ref } = await params;
  const { k } = await searchParams;
  const key = decodeURIComponent(ref);

  if (!trackKeyValid(key, k)) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">This link has expired or is wrong</h1>
        <p className="mt-3 text-white/60">
          Ask us to resend your notification, or track one consignment by its own number above.
        </p>
      </Shell>
    );
  }

  const group = await mergedGroupByInvoiceIds(key.split("-"));
  if (!group) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">We could not find that group</h1>
        <p className="mt-3 text-white/60">
          Track one of your consignments by its own tracking number above.
        </p>
      </Shell>
    );
  }

  const invoiceHref = `/track/merged/${encodeURIComponent(group.key)}/invoice?k=${trackKey(group.key)}`;
  const status = group.settled
    ? "Paid in full"
    : group.partlyPaid
      ? "Partly paid"
      : "Not yet paid";

  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
        {group.customerName} — one bill, {group.lines.length} consignments
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {group.settled ? "Paid in full" : `TZS ${Number(group.totalOutstandingTzs).toLocaleString("en-US")} owed`}
      </h1>
      <p className="mt-3 text-white/70">
        Mizigo yako {group.lines.length} yamewekwa kwenye bili moja ya malipo. Kila mzigo bado
        unaweza kufuatiliwa peke yake kwa namba yake ya tracking.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="divide-y divide-white/10">
          {group.lines.map((line) => (
            <Link
              key={line.cargoId}
              href={`/track/${line.reference}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/5"
            >
              <span>
                <span className="tnum font-mono font-semibold text-white">{line.reference}</span>
                <span className="block text-sm text-white/60">{line.description}</span>
              </span>
              <span className="tnum text-sm text-white/60">
                TZS {Number(line.outstandingTzs ?? line.outstanding).toLocaleString("en-US")}
              </span>
            </Link>
          ))}
        </div>
        <div className="space-y-1 border-t border-white/10 px-4 py-4 text-sm">
          <p className="flex justify-between text-white/70">
            <span>Total CBM</span>
            <span className="tnum">{group.totalCbm} CBM</span>
          </p>
          <p className="tnum flex justify-between text-base font-semibold text-white">
            <span>Amount Owed</span>
            <span>TZS {Number(group.totalOutstandingTzs).toLocaleString("en-US")}</span>
          </p>
          {group.totalOutstandingUsd ? (
            <p className="flex justify-between text-white/70">
              <span>Equivalent</span>
              <span className="tnum">
                USD {Number(group.totalOutstandingUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </p>
          ) : null}
          {group.fxRate ? (
            <p className="flex justify-between text-white/70">
              <span>Exchange Rate</span>
              <span className="tnum">{formatRate(group.fxRate)}</span>
            </p>
          ) : null}
          <p className="flex items-center justify-between pt-1">
            <span className="text-white/70">Status</span>
            <span className="inline-flex items-center gap-1.5 text-success">
              <PackageCheck className="size-4" />
              {status}
            </span>
          </p>
        </div>
      </div>

      <a
        href={invoiceHref}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 text-sm font-medium text-white hover:bg-white/20"
      >
        <Download className="size-4" />
        Download combined invoice (PDF)
      </a>

      {group.storageDeadline ? (
        <p className="mt-6 flex items-center gap-1.5 text-xs text-white/50">
          <FileText className="size-3.5" />
          Free storage ends {formatDate(group.storageDeadline)}
        </p>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TrackHero />
      <section className="relative isolate overflow-hidden bg-ink py-10 sm:py-14">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_-10%,hsl(var(--marine)/0.22),transparent_60%),radial-gradient(ellipse_at_5%_110%,hsl(var(--signal)/0.16),transparent_58%)]"
        />
        <div className="container relative max-w-[860px]">
          <div className="mx-auto max-w-xl text-white">{children}</div>
        </div>
      </section>
    </>
  );
}
