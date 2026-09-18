"use client";

import { useEffect, useRef, useState } from "react";

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
