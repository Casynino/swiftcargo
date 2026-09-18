"use client";

import { useEffect, useRef } from "react";

/**
 * THE SKY BEHIND THE PUBLIC SITE.
 *
 * One fixed canvas under every section: a field of stars that twinkle, and a
 * slow drift of points joined by fine lines when they pass close — the same
 * network the hero draws over the sea, carried down the page. The cursor pulls
 * the nearest points towards it. Two soft nebulae sit behind it in CSS.
 *
 * In the dark theme it is a night sky; in the light theme the stars go and the
 * network is drawn faintly in the brand blue. It pauses when the tab is hidden
 * and draws one still frame under prefers-reduced-motion.
 */
export function SiteSky() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let stars: { x: number; y: number; r: number; p: number; s: number }[] = [];
    let nodes: { x: number; y: number; vx: number; vy: number }[] = [];
    const mouse = { x: -9999, y: -9999 };

    const seed = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = (w * h) / 10000;
      stars = Array.from({ length: Math.round(area * 1.6) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.2,
        p: Math.random() * Math.PI * 2,
        s: 0.5 + Math.random() * 1.5,
      }));
      nodes = Array.from({ length: Math.min(90, Math.round(area * 0.55)) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
      }));
    };

    const draw = (now: number) => {
      const dark = document.documentElement.classList.contains("dark");
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);

      if (dark) {
        for (const star of stars) {
          const a = 0.35 + 0.45 * Math.sin(t * star.s + star.p);
          ctx.fillStyle = `rgba(210,235,255,${Math.max(0.05, a)})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const line = dark ? "120,200,255" : "14,76,135";
      const dot = dark ? "170,225,255" : "14,76,135";
      const reach = Math.min(160, Math.max(110, w / 10));
      for (const n of nodes) {
        if (!still) {
          const dx = mouse.x - n.x;
          const dy = mouse.y - n.y;
          const d = Math.hypot(dx, dy);
          if (d < 220 && d > 1) {
            n.vx += (dx / d) * 0.012;
            n.vy += (dy / d) * 0.012;
          }
          n.vx *= 0.99;
          n.vy *= 0.99;
          const speed = Math.hypot(n.vx, n.vy);
          if (speed < 0.08) {
            n.vx += (Math.random() - 0.5) * 0.04;
            n.vy += (Math.random() - 0.5) * 0.04;
          }
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < -20) n.x = w + 20;
          if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          if (n.y > h + 20) n.y = -20;
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < reach) {
            ctx.strokeStyle = `rgba(${line},${(1 - d / reach) * (dark ? 0.35 : 0.16)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (dm < 200) {
          ctx.strokeStyle = `rgba(244,97,31,${(1 - dm / 200) * 0.5})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(${dot},${dark ? 0.75 : 0.3})`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let frame = 0;
    const loop = (now: number) => {
      draw(now);
      if (!still && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };

    seed();
    draw(performance.now());
    start();

    const onResize = () => {
      seed();
      draw(performance.now());
    };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    const onVisible = () => !document.hidden && start();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className="site-nebula absolute -left-[20%] top-[5%] size-[70vmax] rounded-full bg-[radial-gradient(circle,hsl(var(--marine)/0.16),transparent_60%)] dark:bg-[radial-gradient(circle,hsl(var(--marine)/0.22),transparent_60%)]" />
      <div className="site-nebula absolute -right-[25%] bottom-[-10%] size-[75vmax] rounded-full bg-[radial-gradient(circle,hsl(var(--signal)/0.1),transparent_60%)] [animation-delay:-12s] dark:bg-[radial-gradient(circle,hsl(268_70%_55%/0.18),transparent_60%)]" />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
