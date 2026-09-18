import Image from "next/image";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { NetworkMap } from "@/components/site/network-map";
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
  children,
}: {
  photo?: PhotoName;
  /** The small greeting over the headline on the right. */
  welcome: string;
  /** The headline on the right. */
  title: React.ReactNode;
  subtitle?: string;
  points?: string[];
  children: React.ReactNode;
}) {
  const picture = PHOTOS[photo];
  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-ink text-white">
      <div aria-hidden className="absolute inset-0 -z-10">
        <Image src={picture.src} alt="" fill priority placeholder="blur" sizes="100vw" className="site-drift object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(4,14,26,0.93)_0%,rgba(4,14,26,0.78)_45%,rgba(4,14,26,0.45)_100%)]" />
        <div className="absolute inset-0 bg-[#062a4a]/40 mix-blend-multiply" />
        <div className="absolute inset-0" style={{ perspective: "1400px" }}>
          <div className="absolute inset-0 origin-bottom [transform:rotateX(16deg)_scale(1.05)]">
            <NetworkMap focus={0.74} intensity={0.85} />
          </div>
        </div>
      </div>

      <div className="relative mx-auto grid min-h-dvh max-w-[1400px] items-center gap-12 px-5 py-10 sm:px-10 lg:grid-cols-[minmax(0,30rem)_1fr] lg:gap-20 lg:px-16">
        <div className="animate-in-up">
          <Link href="/" className="dark focus-ring mb-8 inline-block rounded">
            <BrandMark size={44} />
          </Link>
          <div
            className="auth-card dark site-glass rounded-[2rem] p-6 text-foreground sm:p-8"
          >
            {children}
          </div>
        </div>

        <div className="animate-in-up hidden [animation-delay:160ms] lg:block">
          <p className="flex items-center gap-3 text-base font-bold uppercase tracking-[0.14em] text-orange-300">
            <span aria-hidden className="h-0.5 w-8 rounded-full bg-orange-300" />
            {welcome}
          </p>
          <h2 className="mt-5 max-w-xl font-display text-5xl font-bold leading-[1.04] tracking-[-0.03em] xl:text-6xl">
            {title}
          </h2>
          {subtitle ? <p className="mt-5 max-w-lg text-lg text-white/70">{subtitle}</p> : null}
          {points ? (
            <ul className="mt-9 grid max-w-xl gap-3 sm:grid-cols-2">
              {points.map((point) => (
                <li key={point} className="site-glass flex items-start gap-3 rounded-2xl p-4 text-sm text-white/85">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-orange-300" />
                  {point}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </main>
  );
}
