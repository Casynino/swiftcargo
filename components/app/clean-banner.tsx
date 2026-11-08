import { cn } from "@/lib/utils";

/**
 * THE BANNER AT THE TOP OF A HOME SCREEN, KEPT TO WHAT IT IS FOR.
 *
 * A title, one small line saying whose it is, one line for the day, and at most
 * a couple of buttons. Everything else — a sentence of explanation, a search
 * box, a row of chips — is on the page below or in the menu, where it already
 * lives. Centred, with the title set wide and a thin rule either side, so it
 * reads as a heading to a screen rather than as another panel of controls.
 *
 * Dark in both themes, so a bright banner never competes with the data under it.
 */
export function CleanBanner({
  title,
  kicker,
  line,
  children,
  image,
  className,
}: {
  title: React.ReactNode;
  /** Whose it is: the desk, or the route. Set small and wide. */
  kicker?: React.ReactNode;
  /** The day, or whatever one line belongs under the title. */
  line?: React.ReactNode;
  /** A button or two, centred under the lines. */
  children?: React.ReactNode;
  /** A photo that fades in from the right edge, from /public/photos. */
  image?: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border border-white/10 bg-ink px-5 py-7 text-center text-white shadow-raised sm:px-8 sm:py-9",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_90%_130%,hsl(var(--brand)/0.55),transparent_55%),radial-gradient(ellipse_at_0%_-20%,hsl(var(--signal)/0.22),transparent_50%),radial-gradient(ellipse_at_50%_-40%,hsl(var(--marine)/0.35),transparent_60%)]"
      />
      {image ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-cover bg-center opacity-80 [mask-image:linear-gradient(to_right,transparent,black_55%)] md:block"
          style={{ backgroundImage: `url(${image})` }}
        />
      ) : null}
      <div className="relative">
        <div className="flex items-center justify-center gap-4">
          <span aria-hidden className="hidden h-px w-10 bg-signal/70 sm:block" />
          <h1
            className={cn(
              "min-w-0 text-balance font-semibold uppercase",
              /* A long name keeps its size down so it stays on one or two lines. */
              typeof title === "string" && title.length > 13
                ? "text-lg tracking-[0.2em] sm:text-3xl sm:tracking-[0.24em]"
                : "text-xl tracking-[0.3em] sm:text-4xl"
            )}
          >
            {title}
          </h1>
          <span aria-hidden className="hidden h-px w-10 bg-signal/70 sm:block" />
        </div>
        {kicker ? (
          <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.32em] text-signal">{kicker}</p>
        ) : null}
        {line ? <p className="tnum mt-1.5 text-sm text-white/70">{line}</p> : null}
        {children ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
      </div>
    </section>
  );
}
