import Link from "next/link";
import type { Metadata } from "next";
import { Package } from "lucide-react";

import { TrackForm } from "@/components/site/track-form";
import { Card } from "@/components/ui/card";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Track your cargo",
  description:
    "Enter your Swift Cargo reference to see where your sea freight is between Guangzhou and Dar es Salaam.",
  alternates: { canonical: "/track" },
};

/* The same nine steps the result page draws, named once here for somebody who
   has not got a reference to hand yet. */
const JOURNEY = [
  ["Received at our Guangzhou warehouse", "Counted, weighed, measured and photographed"],
  ["Loaded into a container", "Guangzhou"],
  ["Departed China", "The container sails"],
  ["At sea", "Around 28–30 days, with an expected arrival date"],
  ["Arrived in Dar es Salaam", "At the port"],
  ["Received at our Dar warehouse", "Counted again against what left China"],
  ["Invoice issued", "Sign in to see it and pay"],
  ["Ready for collection", "Once the invoice is settled and checks are complete"],
  ["Collected", "Or delivered to your address"],
] as const;

export default function TrackPage() {
  const locale = DEFAULT_LOCALE;
  return (
    <div className="container max-w-2xl py-16 sm:py-20">
      <span className="grid size-12 place-items-center rounded-xl bg-brand/8 text-brand">
        <Package className="size-6" />
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        {t(locale, "Track your cargo")}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {t(
          locale,
          "Enter the reference on your delivery note or box label. It looks like SC0125."
        )}
      </p>

      <div className="mt-8">
        <TrackForm />
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {t(locale, "Have an account?")}{" "}
        <Link href="/login?callbackUrl=%2Fportal" className="font-medium text-brand hover:underline">
          {t(locale, "Sign in to see all of your cargo, invoices and photos.")}
        </Link>
      </p>

      <Card className="mt-12 p-7">
        <p className="eyebrow text-marine">{t(locale, "The journey")}</p>
        <ol className="mt-5 space-y-4">
          {JOURNEY.map(([label, where], i) => (
            <li key={label} className="flex gap-3.5">
              <span className="tnum mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium">{t(locale, label)}</p>
                <p className="text-xs text-muted-foreground">{t(locale, where)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
