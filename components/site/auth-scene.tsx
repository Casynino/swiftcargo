import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { NetworkMap } from "@/components/site/network-map";
import { AuthSheet } from "@/components/site/auth-sheet";
import { PHOTOS, type PhotoName } from "@/components/site/photos";

/**
 * THE DOOR INTO THE SYSTEM.
 *
 * Sign-in and registration open on the same scene as the website's front page
 * — a ship at sea, the live network of ports drawn over it, our lane in orange
 * — with the form on a glass card in front. Somebody signing in should feel
 * they have arrived somewhere, not been handed a form.
 *
 * The card is always drawn in the dark theme, whatever the reader has chosen,
 * because it always sits on the dark photograph.
 */
export function AuthScene({
  photo = "shipWake",
  welcome,
  title,
  subtitle,
  points,
  cta = "Log in",
  tagline,
  defaultOpen = false,
  children,
}: {
  photo?: PhotoName;
  /** The small greeting over the headline on the right. */
  welcome: string;
  /** The headline on the right. */
  title: React.ReactNode;
  subtitle?: string;
  points?: string[];
  /** The one small button on a phone's first screen. */
  cta?: string;
  /** The single line over that button. */
  tagline?: React.ReactNode;
  /** Open the form at once on a phone, for a notice that must be read. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const picture = PHOTOS[photo];
  return (
    <main data-login-scene className="relative isolate min-h-dvh overflow-hidden bg-ink text-white">
      <div aria-hidden className="absolute inset-0 -z-10">
        <Image src={picture.src} alt="" fill priority placeholder="blur" sizes="100vw" className="site-drift object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,14,26,0.45)_0%,rgba(4,14,26,0.55)_55%,rgba(4,14,26,0.86)_100%)] lg:bg-[linear-gradient(100deg,rgba(4,14,26,0.94)_0%,rgba(4,14,26,0.84)_45%,rgba(4,14,26,0.66)_100%)]" />
        <div className="absolute inset-0 bg-[#062a4a]/40 mix-blend-multiply" />
        <div className="absolute inset-0" style={{ perspective: "1400px" }}>
          <div className="absolute inset-0 origin-bottom [transform:rotateX(16deg)_scale(1.05)]">
            <NetworkMap focus={0.74} intensity={0.8} />
          </div>
        </div>
      </div>

      <div className="relative mx-auto grid min-h-dvh max-w-[1400px] items-center gap-12 px-5 py-10 sm:px-10 lg:grid-cols-[minmax(0,30rem)_1fr] lg:gap-20 lg:px-16">
        <div>
          <Link href="/" className="dark focus-ring mb-8 hidden rounded lg:inline-block">
            <BrandMark size={44} />
          </Link>
          <AuthSheet cta={cta} tagline={tagline ?? subtitle ?? welcome} defaultOpen={defaultOpen}>
            {children}
          </AuthSheet>
        </div>

        <div className="animate-in-up relative hidden [animation-delay:160ms] lg:block">
          {/* A pool of shadow under the words, so the map and the photograph
              never compete with them. */}
          <div
            aria-hidden
            className="absolute -inset-x-16 -inset-y-20 -z-10 bg-[radial-gradient(ellipse_at_40%_50%,rgba(4,12,22,0.92)_0%,rgba(4,12,22,0.7)_45%,transparent_75%)]"
          />
          <p className="flex items-center gap-3 text-sm font-medium text-orange-300">
            <span aria-hidden className="h-0.5 w-8 rounded-full bg-orange-300" />
            {welcome}
          </p>
          <h2 className="mt-5 max-w-xl font-display text-5xl font-bold leading-[1.04] [text-shadow:0_4px_30px_rgba(0,0,0,0.6)] tracking-[-0.03em] xl:text-6xl">
            {title}
          </h2>
          {subtitle ? <p className="mt-6 max-w-lg text-xl leading-relaxed text-white/90">{subtitle}</p> : null}
          {points ? (
            <ul className="mt-9 grid max-w-xl gap-3 sm:grid-cols-2">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-3 rounded-2xl border border-white/15 bg-[rgba(6,16,28,0.8)] p-4 text-base font-medium text-white shadow-[0_20px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-orange-300" />
                  {point}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {/* Who made the system: one quiet line to Nino's page and work. */}
      <footer className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:justify-start lg:px-16">
        <Link
          href="/nino"
          className="focus-ring group inline-flex min-h-10 items-center gap-1 rounded-sm text-xs text-white/55 transition-colors hover:text-white"
        >
          Developed by <span className="font-semibold text-white/80 transition-colors group-hover:text-[#c6f432]">Nino</span>
          <ArrowUpRight className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      </footer>
    </main>
  );
}
