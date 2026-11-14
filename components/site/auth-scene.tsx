import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { AuthSheet } from "@/components/site/auth-sheet";
import type { VideoName } from "@/components/site/kit";
import { BgVideo } from "@/components/site/motion";

/**
 * THE DOOR INTO THE SYSTEM.
 *
 * One scene on every screen, phone and computer alike (Nino, 14 Nov 2026: the computer should look like the phone,
 * like ZELab's sign-in): real footage of the route filling the page, the mark, one line, and the two doors — Sign in
 * and Create account. The form is not on the picture; it comes up as a small glass card when a door is pressed.
 */
export function AuthScene({
  video = "port-night",
  cta = "Sign in",
  alt,
  tagline,
  defaultOpen = false,
  children,
}: {
  video?: VideoName;
  /** The one small button on the first screen. */
  cta?: string;
  /** The other door on the first screen. */
  alt?: { label: string; href: string };
  /** The single line over that button. */
  tagline: React.ReactNode;
  /** Open the form at once, for a notice that must be read. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main data-login-scene className="relative isolate min-h-dvh overflow-hidden bg-ink text-white">
      <div aria-hidden className="absolute inset-0 -z-10">
        <BgVideo name={video} />
        {/* One even dark veil and a darker rim: the port glows through, quiet enough that the words lead. */}
        <div className="absolute inset-0 bg-[rgba(3,10,19,0.5)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(3,10,19,0.75)_100%)]" />
      </div>

      {/* The way back to the public website, from the sign-in and register pages alike. */}
      <Link
        href="/"
        className="focus-ring absolute left-4 top-[max(0.75rem,calc(env(safe-area-inset-top)+0.5rem))] z-10 inline-flex h-9 items-center gap-1.5 text-xs font-medium text-white/75 transition-colors hover:text-white sm:left-8 sm:top-6"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to site
      </Link>

      <div className="relative mx-auto flex min-h-dvh max-w-[1400px] flex-col px-5 pb-12 pt-14 sm:px-10">
        <AuthSheet cta={cta} alt={alt} tagline={tagline} defaultOpen={defaultOpen}>
          {children}
        </AuthSheet>
      </div>

      {/* Foot of the page: one quiet centred line, "Sea Freight System by Nino", linking to Nino's page and work. Worded
          like ZELab's and Super Drive's sign-in pages, not "Developed by". */}
      <footer className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-1 text-[11px] text-white/65 [text-shadow:0_1px_6px_rgba(3,8,18,0.95)] sm:pb-[max(0.9rem,env(safe-area-inset-bottom))] sm:text-xs">
        <span>Sea Freight System</span>
        <Link
          href="/nino"
          aria-label="Sea Freight System by Nino: see his work"
          className="focus-ring group inline-flex min-h-8 items-center gap-1 rounded-sm transition-colors hover:text-white"
        >
          by <span className="font-semibold text-white/85 transition-colors group-hover:text-[#c6f432]">Nino</span>
          <ArrowUpRight className="size-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      </footer>
    </main>
  );
}
