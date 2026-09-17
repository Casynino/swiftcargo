import Link from "next/link";
import type { Metadata } from "next";
import {
  Check,
  Circle,
  CircleDot,
  Clock,
  Lock,
  Ship,
  TriangleAlert,
} from "lucide-react";

import { SeaLaneStrip } from "@/components/site/sea-lane";
import { TrackForm } from "@/components/site/track-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { clientAddress, hit } from "@/lib/rate-limit";
import { laneFraction } from "@/lib/sea-lane";
import { referenceFromInput, trackByReference } from "@/lib/tracking";
import { cn } from "@/lib/utils";

/* One customer's cargo: never cached, never indexed. A cached page is
   yesterday's ETA. */
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
 * It used to read "Tracking SC0001" over the site's generic blurb, which is
 * what a machine would write. What goes out now is a greeting in the
 * customer's own language — and nothing else. WhatsApp renders this card on
 * their servers and shows it to everybody in the group the link was pasted
 * into, so no amount, no name and no figure belongs in it. The page itself
 * stays unindexed.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const reference = referenceFromInput(safeDecode(code));
  return {
    title: reference
      ? `${t(DEFAULT_LOCALE, "Fuatilia mzigo")} ${reference}`
      : t(DEFAULT_LOCALE, "Fuatilia mzigo wako — Track your cargo"),
    description:
      "Mzigo wako kwa meli, Guangzhou hadi Dar es Salaam. See where your cargo has reached.",
    openGraph: {
      type: "website",
      title: "Swift Cargo — Fuatilia mzigo wako",
      description:
        "Mzigo wako kwa meli, Guangzhou → Dar es Salaam. Fungua kiungo uone umefika wapi — track your cargo.",
    },
    robots: { index: false, follow: false },
  };
}

/* Generous enough for an office looking up a container's worth of customers
   from one connection; far too slow to walk the reference sequence. */
const LOOKUPS_PER_WINDOW = 40;
const WINDOW_MS = 10 * 60 * 1000;

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
        <p className="mt-3 text-muted-foreground">
          {t(
            locale,
            "Your reference is on your delivery note and on every box label. It looks like SC0125."
          )}
        </p>
        <div className="mt-8">
          <TrackForm />
        </div>
      </Shell>
    );
  }

  const limit = hit(`track:${await clientAddress()}`, LOOKUPS_PER_WINDOW, WINDOW_MS);
  if (!limit.ok) {
    return (
      <Shell>
        <Clock className="size-8 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {t(locale, "Too many lookups")}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {t(
            locale,
            "Please wait a few minutes and try again, or sign in to see all of your cargo at once."
          )}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/login?callbackUrl=%2Fportal">{t(locale, "Sign in")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/contact">{t(locale, "Contact us")}</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const result = await trackByReference(reference);

  if (!result) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t(locale, "We cannot find")} <span className="tnum">{reference}</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          {t(
            locale,
            "Check the reference on your delivery note or box label. If your goods were only received today they may not be on the system yet."
          )}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            locale,
            "Shipping marks cannot be tracked here. Sign in to see everything under your mark."
          )}
        </p>
        <div className="mt-8">
          <TrackForm />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/login?callbackUrl=%2Fportal">{t(locale, "Sign in")}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/contact">{t(locale, "Ask us instead")}</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const { journey } = result;
  const reached = journey.steps.filter((s) => s.state !== "upcoming").length;
  const progress = (reached / journey.steps.length) * 100;
  const stepAt = (key: string) =>
    journey.steps.find((s) => s.key === key)?.at ?? null;
  const done = (key: string) =>
    journey.steps.find((s) => s.key === key)?.state !== "upcoming";
  const arrivedAt = stepAt("ARRIVED_DAR");

  /* Where the drawing puts the ship. Read lib/sea-lane.ts before taking it for
     a position: it is the sailing date and the promised date and nothing else,
     and the caption under the picture says so out loud. */
  const departedAt = stepAt("DEPARTED");
  const fraction = laneFraction({
    stage: {
      loaded: done("LOADED"),
      departed: done("DEPARTED"),
      arrived: done("ARRIVED_DAR"),
    },
    departedAt: departedAt ? new Date(departedAt) : null,
    eta: journey.eta ? new Date(journey.eta) : null,
    now: new Date(),
  });

  const facts: [string, string][] = [
    [t(locale, "Packages"), result.packages !== null ? String(result.packages) : "—"],
    [t(locale, "Container"), result.containerReference ?? "—"],
    [t(locale, "Vessel"), result.vessel ?? "—"],
    journey.eta
      ? [t(locale, "Expected in Dar"), formatDate(journey.eta)]
      : [t(locale, "Arrived in Dar"), formatDate(arrivedAt)],
  ];

  return (
    <>
      {/* The header is the chart. Somebody who has just tapped a link in
          WhatsApp wants to see the ocean their box is on before they read a
          column of dates — and the same drawing as the front of the site says
          they are still on Swift Cargo rather than on a bare status page. */}
      <section className="relative isolate overflow-hidden bg-ink text-white">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_10%,hsl(var(--marine)/0.22),transparent_60%),radial-gradient(ellipse_at_10%_100%,hsl(var(--signal)/0.16),transparent_58%)]"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-marine/50 to-transparent"
        />

        <div className="container relative max-w-3xl py-10 sm:py-14">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow text-marine">{t(locale, "Cargo reference")}</p>
              <h1 className="tnum mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                {result.reference}
              </h1>
              <p className="mt-2 text-sm text-white/60">
                {result.service === "FCL"
                  ? t(locale, "Full container")
                  : t(locale, "Loose cargo")}{" "}
                · {t(locale, "Guangzhou to Dar es Salaam")}
              </p>
            </div>
            <Badge
              tone={journey.tone}
              className="shrink-0 border-white/15 bg-white/10 text-sm text-white"
            >
              {t(locale, journey.headline)}
            </Badge>
          </div>

          <SeaLaneStrip
            fraction={fraction}
            className="mt-7 aspect-[720/340] w-full"
          />
          <p className="mt-2.5 text-xs leading-relaxed text-white/45">
            {t(
              locale,
              "The ship is drawn from the sailing date and the expected date — where the schedule says your container should be, not a live position."
            )}
          </p>
        </div>
      </section>

      <div className="container max-w-3xl py-10 sm:py-12">
        {journey.notice ? (
          <Card className="border-warning/30 bg-warning/5 p-5">
            <p className="flex items-center gap-2 font-medium text-warning">
              <TriangleAlert className="size-4 shrink-0" />
              {t(locale, journey.headline)}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t(locale, journey.notice)}
            </p>
          </Card>
        ) : journey.headline === "Ready for collection" ? (
          <Card className="border-success/30 bg-success/5 p-5">
            <p className="flex items-center gap-2 font-medium text-success">
              <Check className="size-4 shrink-0" />
              {t(locale, "Ready to collect")}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t(
                locale,
                "Everything is settled. Bring your ID to our Dar es Salaam warehouse, or sign in to ask us to deliver it."
              )}
            </p>
          </Card>
        ) : journey.payment === "PENDING" ? (
          <Card className="border-warning/30 bg-warning/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-warning">
                  {t(locale, "Payment pending")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    locale,
                    "Sign in to see your invoice and tell us when you have paid."
                  )}
                </p>
              </div>
              <Button asChild>
                <Link href="/login?callbackUrl=%2Fportal%2Finvoices">
                  {t(locale, "Sign in to pay")}
                </Link>
              </Button>
            </div>
          </Card>
        ) : null}

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {facts.map(([label, value]) => (
            <Card key={label} className="min-w-0 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </dt>
              <dd className="tnum mt-1.5 truncate text-sm font-semibold" title={value}>
                {value}
              </dd>
            </Card>
          ))}
        </dl>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">{t(locale, "Progress")}</CardTitle>
            <div
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-label={t(locale, "Progress")}
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-marine transition-all duration-700"
                style={{ width: `${Math.max(4, progress)}%` }}
              />
            </div>
          </CardHeader>
          <CardContent>
            <ol>
              {journey.steps.map((step, i) => (
                <li key={step.key} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full border-2",
                        step.state === "done" && "border-brand bg-brand text-brand-foreground",
                        step.state === "current" && "border-signal bg-signal text-signal-foreground",
                        step.state === "upcoming" && "border-border bg-background"
                      )}
                    >
                      {step.state === "done" ? (
                        <Check className="size-3.5" />
                      ) : step.state === "current" ? (
                        <CircleDot className="size-3.5" />
                      ) : (
                        <Circle className="size-2 text-muted-foreground" />
                      )}
                    </span>
                    {i < journey.steps.length - 1 ? (
                      <span
                        className={cn(
                          "w-0.5 flex-1",
                          step.state === "done" ? "bg-brand" : "bg-border"
                        )}
                        style={{ minHeight: 24 }}
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 pb-6">
                    <p
                      className={cn(
                        "text-sm",
                        step.state === "current"
                          ? "font-semibold"
                          : step.state === "done"
                            ? "font-medium"
                            : "text-muted-foreground"
                      )}
                    >
                      {t(locale, step.label)}
                    </p>
                    {step.detail || step.at ? (
                      <p className="tnum text-xs text-muted-foreground">
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
              ))}
            </ol>

            {result.vessel ? (
              <p className="flex items-center gap-2 border-t pt-5 text-sm text-muted-foreground">
                <Ship className="size-4 shrink-0 text-marine" />
                {t(locale, "Sailing on")} {result.vessel}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="mt-6 p-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Lock className="size-4 shrink-0 text-marine" />
            {t(locale, "Is this your cargo?")}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t(
              locale,
              "Sign in to see what we received, the photos taken at our warehouse, your invoice and your payments."
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild size="sm">
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(`/portal/cargo/${result.reference}`)}`}
              >
                {t(locale, "Sign in")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/register">{t(locale, "Create an account")}</Link>
            </Button>
          </div>
        </Card>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          {t(locale, "Tracking something else?")}
        </p>
        <div className="mx-auto mt-3 max-w-md">
          <TrackForm />
        </div>
      </div>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="container max-w-2xl py-16 sm:py-20">{children}</div>;
}
