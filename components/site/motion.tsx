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
