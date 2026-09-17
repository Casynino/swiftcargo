"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that counts up on first paint.
 *
 * The only client component inside a KPI card, so a row of eight cards ships
 * almost no JavaScript. It respects prefers-reduced-motion by rendering the
 * final value immediately — a number sprinting upward is exactly the kind of
 * movement that setting exists to stop.
 */
export function CountUp({
  value,
  duration = 900,
  decimals = 0,
}: {
  value: number;
  duration?: number;
  decimals?: number;
}) {
  const [shown, setShown] = useState(value);
  const frame = useRef<number>(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value === 0) {
      setShown(value);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      /* Ease-out cubic: fast at first, settling into the real figure, so the
         number is readable well before the animation finishes. */
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(value * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration]);

  return (
    <>
      {shown.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </>
  );
}
