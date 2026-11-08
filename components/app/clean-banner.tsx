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
  controls,
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
  /** The bell and the moon, top left, on a computer. */
  controls?: React.ReactNode;
  /** A photo that fades in from the right edge, from /public/photos. */
  image?: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(125deg,#07112a_0%,#0b1d47_48%,#17387a_100%)] px-4 py-5 text-center text-white shadow-raised ring-1 ring-inset ring-white/5 sm:rounded-3xl sm:px-8 sm:py-9",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_90%_140%,rgba(88,140,235,0.42),transparent_55%),radial-gradient(ellipse_at_0%_-30%,rgba(227,179,65,0.22),transparent_50%)]"
      />
      {image ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-cover bg-center opacity-80 [mask-image:linear-gradient(to_right,transparent,black_55%)] md:block"
          style={{ backgroundImage: `url(${image})` }}
        />
      ) : null}
      {controls ? <div className="absolute left-6 top-1/2 z-10 hidden -translate-y-1/2 lg:block">{controls}</div> : null}
      <div className="relative">
        <div className="flex items-center justify-center gap-4">
          <span aria-hidden className="hidden h-px w-10 bg-[#e3b341]/80 sm:block" />
          <h1
            className={cn(
              "min-w-0 text-balance font-semibold uppercase",
              /* A long name keeps its size down so it stays on one or two lines. */
              typeof title === "string" && title.length > 13
                ? "text-base tracking-[0.2em] sm:text-3xl sm:tracking-[0.24em]"
                : "text-lg tracking-[0.28em] sm:text-4xl sm:tracking-[0.3em]"
            )}
          >
            {title}
          </h1>
          <span aria-hidden className="hidden h-px w-10 bg-[#e3b341]/80 sm:block" />
        </div>
        {kicker ? (
          <p className="mt-1.5 text-[10px] sm:mt-2.5 sm:text-[11px] font-semibold uppercase tracking-[0.32em] text-[#e3b341]">{kicker}</p>
        ) : null}
        {line ? <p className="tnum mt-1 text-xs text-white/70 sm:mt-1.5 sm:text-sm">{line}</p> : null}
        {children ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
      </div>
    </section>
  );
}
