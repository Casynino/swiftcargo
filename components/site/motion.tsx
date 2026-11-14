"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * RISE INTO VIEW AS THE PAGE IS SCROLLED.
 *
 * Only what starts below the fold is ever hidden. The server renders every
 * section visible, and the observer hides a section only after it has checked
 * the section is off screen — so a page opened without script, a crawler, a
 * share-card capture and the first screen of every visit all see the words
 * immediately, and nothing above the fold ever flashes in.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Milliseconds, for a row that should arrive in order. */
  delay?: number;
  as?: "div" | "li" | "section" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (node.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    node.dataset.pending = "";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          delete node.dataset.pending;
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={cn("site-reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * A count that runs up to a real figure when it comes into view.
 *
 * The figure is rendered in full on the server; the animation only replays it.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node || value <= 0 || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      const start = performance.now();
      const run = (now: number) => {
        const p = Math.min(1, (now - start) / 1400);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) frame = requestAnimationFrame(run);
      };
      setShown(0);
      frame = requestAnimationFrame(run);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString("en-US")}
    </span>
  );
}


const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A HEADING WHOSE WORDS RISE INTO PLACE ONE AFTER THE OTHER.
 *
 * Each word sits in a mask and slides up from below it (ORA's headings do the same). The server renders the words in
 * place, so a page opened without script, a crawler and a share card all read the heading at once; the browser then
 * hides the words before the first paint and plays them in — straight away for the page's own title, as it scrolls
 * into view for the rest.
 */
export function SplitHeading({
  as: Tag = "h2",
  lead,
  trail,
  className,
  trailClassName,
  immediate = false,
}: {
  as?: "h1" | "h2" | "h3";
  lead: string;
  trail?: string;
  className?: string;
  /** Applied to the second half: the muted or hollow tone of a two-tone heading. */
  trailClassName?: string;
  immediate?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || reduced()) return;
    const onScreen = node.getBoundingClientRect().top < window.innerHeight * 0.92;
    node.dataset.split = "hidden";
    if (immediate || onScreen) {
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => (node.dataset.split = "in")));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        node.dataset.split = "in";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [immediate]);

  const words = [
    ...lead.split(" ").map((w) => ({ w, trail: false })),
    ...(trail ? trail.split(" ").map((w) => ({ w, trail: true })) : []),
  ];
  return (
    <Tag ref={ref as never} className={className}>
      {words.map((item, i) => (
        <span key={i}>
          <span className="split-w">
            <span className={cn("split-i", item.trail && trailClassName)} style={{ ["--i" as string]: i }}>
              {item.w}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}

/**
 * A PICTURE UNVEILED AS IT COMES INTO VIEW.
 *
 * The frame opens from the bottom edge (the way ORA's arch windows do). Only a picture that starts below the fold is
 * ever closed first, so nothing on the first screen waits and a page without script shows every picture.
 */
export function RevealFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || reduced()) return;
    if (node.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    node.dataset.clip = "closed";
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        node.dataset.clip = "open";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -6% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("site-clip", className)}>
      {children}
    </div>
  );
}

/**
 * A STATEMENT THAT LIGHTS UP AS IT IS READ.
 *
 * Every word starts dim and comes up to full as the paragraph scrolls through the screen (ORA's manifesto). Read in
 * full by anyone without script.
 */
export function ScrollWords({ text, accent = [], className }: { text: string; accent?: string[]; className?: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const words = text.split(" ");

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced()) return;
    const spans = Array.from(node.querySelectorAll<HTMLElement>("[data-w]"));
    node.dataset.scroll = "on";
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = node.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.3)));
      const lit = Math.round(p * spans.length);
      spans.forEach((el, i) => (el.dataset.lit = i < lit ? "1" : "0"));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i}>
          <span data-w data-accent={accent.includes(w.replace(/[.,!?]/g, "").toLowerCase()) ? "1" : undefined} className="scroll-word">
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </p>
  );
}

/**
 * ONE NUMBER FOR SCROLL-LINKED MOTION.
 *
 * Writes `--p` (0 → 1) on its element as the page scrolls, and the CSS turns that number into movement (sc-hero-photo,
 * sc-rail, sc-track in globals.css). "leave": 0 while the element's top is at the top of the screen, 1 once it has
 * scrolled away — for a hero. "through": 0 as it enters at the foot, 1 as its foot reaches the middle — for a progress
 * rail. "pin": 0 → 1 across the extra height of a tall section whose child sticks — for a sideways gallery. Without
 * script, or with reduced motion, `--p` stays unset and everything sits still in place.
 */
export function ScrollVar({
  mode = "through",
  className,
  children,
  as: Tag = "div",
  style,
}: {
  mode?: "leave" | "through" | "pin";
  className?: string;
  children?: React.ReactNode;
  as?: "div" | "section" | "ol";
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced()) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const r = node.getBoundingClientRect();
      const vh = window.innerHeight;
      let p: number;
      if (mode === "leave") p = -r.top / Math.max(1, r.height);
      else if (mode === "pin") p = -r.top / Math.max(1, r.height - vh);
      else p = (vh - r.top) / Math.max(1, r.height + vh * 0.5);
      node.style.setProperty("--p", Math.min(1, Math.max(0, p)).toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [mode]);

  return (
    <Tag ref={ref as never} className={className} style={style}>
      {children}
    </Tag>
  );
}

/**
 * A LIVE COUNT DOWN TO A REAL DATE.
 *
 * Days, hours, minutes and seconds to the moment given (the cargo deadline of the next sailing). The server cannot know
 * the reader's second, so the figures fill in once the page is running; before that the cells hold dashes of the same
 * width, so nothing shifts.
 */
export function Countdown({
  to,
  labels = ["d", "h", "m", "s"],
  className,
  cellClassName,
}: {
  to: string;
  labels?: [string, string, string, string] | string[];
  className?: string;
  cellClassName?: string;
}) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(to).getTime();
    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [to]);

  const parts =
    left === null
      ? ["--", "--", "--", "--"]
      : [
          Math.floor(left / 86_400_000),
          Math.floor(left / 3_600_000) % 24,
          Math.floor(left / 60_000) % 60,
          Math.floor(left / 1000) % 60,
        ].map((n) => String(n).padStart(2, "0"));

  return (
    <span className={cn("tnum inline-flex items-baseline gap-2", className)} role="timer" aria-live="off">
      {parts.map((v, i) => (
        <span key={i} className={cellClassName}>
          {v}
          <span className="ml-0.5 text-[0.55em] font-normal opacity-60">{labels[i]}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * A FILM BEHIND A SECTION.
 *
 * Real footage of the route (public/video, cut to a few MB each): the still frame is on screen at once as the
 * poster, and the film only starts loading once the page is idle and the line can carry it — never on data saver or
 * a 2G line, and never for somebody who has asked their phone for less motion, who keeps the still. It pauses when
 * scrolled out of sight, so a long page is not playing four films at once on a phone's battery.
 */
export function BgVideo({ name, className }: { name: "ship-sea" | "port-night" | "yard-crane" | "port-drone"; className?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || reduced()) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      setSrc(`/video/${name}.mp4`);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) {
          if (!started) {
            const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
              .requestIdleCallback;
            if (idle) idle(start, { timeout: 2500 });
            else window.setTimeout(start, 800);
          } else video.play().catch(() => {});
        } else if (started) video.pause();
      },
      { rootMargin: "200px 0px" }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [name]);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;
    video.load();
    video.play().catch(() => {});
  }, [src]);

  return (
    <div className={cn("absolute inset-0", className)}>
      {/* The still is the film's own first frame, already sized: a plain img, no optimiser round trip. */}
      <img src={`/video/${name}.webp`} alt="" className="absolute inset-0 size-full object-cover" decoding="async" />
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="none"
        src={src ?? undefined}
        onPlaying={() => setPlaying(true)}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-1000",
          playing ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
