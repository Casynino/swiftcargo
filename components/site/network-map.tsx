"use client";

import { useEffect, useRef } from "react";

import { worldDots } from "@/components/site/world-dots";
import { cn } from "@/lib/utils";

/**
 * THE LIVE NETWORK OVER THE HERO PHOTOGRAPHS.
 *
 * A dotted world laid over the sea, ports lit up on it, arcs of light between
 * them and pulses running along the arcs — with our own lane, Guangzhou to Dar
 * es Salaam, drawn brightest and in the brand orange. The other arcs are the
 * trade the lane is part of, drawn faint; only ours is named.
 *
 * One canvas, one animation frame loop, paused whenever the hero is off screen
 * or the tab is hidden. Under prefers-reduced-motion it draws a single still
 * frame and stops.
 */

type Port = [name: string, lon: number, lat: number];

const PORTS: Port[] = [
  ["Guangzhou", 113.3, 23.1],
  ["Dar es Salaam", 39.3, -6.8],
  ["Shanghai", 121.5, 31.2],
  ["Singapore", 103.8, 1.3],
  ["Colombo", 79.9, 6.9],
  ["Mumbai", 72.8, 19],
  ["Jebel Ali", 55.1, 25],
  ["Mombasa", 39.7, -4],
  ["Durban", 31, -29.9],
  ["Lagos", 3.4, 6.5],
  ["Rotterdam", 4.5, 51.9],
  ["Busan", 129, 35.1],
  ["Sydney", 151.2, -33.9],
  ["Santos", -46.3, -23.9],
  ["New York", -74, 40.7],
  ["Los Angeles", -118.2, 33.7],
  ["Istanbul", 29, 41],
];

/* Pairs of port indexes. The first is ours and is drawn as the lane. */
const LINKS: [number, number][] = [
  [0, 1],
  [0, 3], [3, 4], [4, 1], [2, 0], [11, 2], [3, 12], [4, 5], [5, 6], [6, 1],
  [1, 7], [1, 8], [8, 9], [9, 10], [6, 16], [16, 10], [10, 14], [14, 13],
  [13, 8], [15, 11], [15, 14], [2, 15], [7, 6],
];

export function NetworkMap({
  className,
  /** Where the map sits in the frame, as a share of the width it is centred on. */
  focus = 0.62,
  intensity = 1,
}: {
  className?: string;
  focus?: number;
  intensity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* A canvas cannot read a CSS variable, so the display face is looked up. */
    const face =
      getComputedStyle(document.body).getPropertyValue("--font-display").trim() || "system-ui";
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dots = worldDots();
    const twinkle = dots.map(() => [Math.random() * Math.PI * 2, 0.6 + Math.random() * 1.4]);
    const pulses = LINKS.map((_, i) => ({
      t: Math.random(),
      speed: i === 0 ? 0.0021 : 0.0009 + Math.random() * 0.0013,
    }));

    let width = 0;
    let height = 0;
    let scale = 1;
    let ox = 0;
    let oy = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* The whole world fits the width on a wide screen; a phone is allowed
         to crop the Americas so Africa and Asia stay a readable size. */
      const phone = width < 768;
      scale = phone ? width / 150 : width / 380;
      /* Most of the world on a wide screen, centred on the Indian Ocean so our
         lane sits right of the words and the Americas fade out under them; on
         a phone, the lane itself. */
      const centreLon = phone ? 76 : 62;
      ox = width * focus - (centreLon + 180) * scale;
      oy = height * 0.44 - (90 - 14) * scale;
    };

    const project = (lon: number, lat: number): [number, number] => [
      ox + (lon + 180) * scale,
      oy + (90 - lat) * scale,
    ];

    const arc = (a: number, b: number) => {
      const [x1, y1] = project(PORTS[a][1], PORTS[a][2]);
      const [x2, y2] = project(PORTS[b][1], PORTS[b][2]);
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2 - dist * 0.32;
      return { x1, y1, x2, y2, cx, cy };
    };

    const pointOn = (
      { x1, y1, x2, y2, cx, cy }: ReturnType<typeof arc>,
      t: number
    ): [number, number] => {
      const u = 1 - t;
      return [u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2];
    };

    const glow = (x: number, y: number, r: number, color: string, alpha: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color},${alpha})`);
      g.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      const time = now / 1000;
      const dotR = Math.max(2.2, scale * 0.85);

      /* The land, as dots that breathe. */
      for (let i = 0; i < dots.length; i++) {
        const [x, y] = project(dots[i][0], dots[i][1]);
        if (x < -4 || x > width + 4 || y < -4 || y > height + 4) continue;
        const [phase, rate] = twinkle[i];
        const a = (0.62 + 0.3 * Math.sin(time * rate + phase)) * intensity;
        ctx.fillStyle = `rgba(120,215,255,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, dotR / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      /* The arcs, and a pulse of light running along each. */
      LINKS.forEach(([a, b], i) => {
        const ours = i === 0;
        const c = arc(a, b);
        ctx.beginPath();
        ctx.moveTo(c.x1, c.y1);
        ctx.quadraticCurveTo(c.cx, c.cy, c.x2, c.y2);
        ctx.strokeStyle = ours
          ? `rgba(255,138,76,${0.9 * intensity})`
          : `rgba(200,235,255,${0.38 * intensity})`;
        ctx.lineWidth = ours ? 2.4 : 1.1;
        if (ours) {
          ctx.shadowColor = "rgba(255,120,50,0.9)";
          ctx.shadowBlur = 12;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        const p = pulses[i];
        if (!still) p.t = (p.t + p.speed) % 1;
        const trail = ours ? 14 : 8;
        for (let k = 0; k < trail; k++) {
          const t = p.t - k * 0.012;
          if (t < 0) break;
          const [x, y] = pointOn(c, t);
          const fade = 1 - k / trail;
          ctx.fillStyle = ours
            ? `rgba(255,190,140,${fade * intensity})`
            : `rgba(255,255,255,${fade * 0.7 * intensity})`;
          ctx.beginPath();
          ctx.arc(x, y, (ours ? 2.6 : 1.6) * fade + 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      /* The ports: a lamp, and a ring spreading out from it. */
      PORTS.forEach(([name, lon, lat], i) => {
        const [x, y] = project(lon, lat);
        const ours = i < 2;
        const beat = (time * 0.6 + i * 0.37) % 1;
        glow(x, y, ours ? 22 : 12, ours ? "255,140,70" : "180,230,255", (ours ? 0.55 : 0.35) * intensity);
        ctx.strokeStyle = ours
          ? `rgba(255,150,90,${(1 - beat) * 0.8 * intensity})`
          : `rgba(200,240,255,${(1 - beat) * 0.45 * intensity})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, 3 + beat * (ours ? 22 : 12), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = ours ? "#ffd2b3" : "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(x, y, ours ? 3.4 : 2, 0, Math.PI * 2);
        ctx.fill();

        if (ours) {
          ctx.font = `700 14px ${face}, system-ui, sans-serif`;
          ctx.fillStyle = `rgba(255,255,255,${0.95 * intensity})`;
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = 6;
          ctx.fillText(name, x + 10, y + (i === 0 ? -8 : 16));
          ctx.shadowBlur = 0;
        }
      });
    };

    let frame = 0;
    let visible = true;
    const loop = (now: number) => {
      draw(now);
      if (!still && visible && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };

    resize();
    draw(performance.now());
    start();

    /* Resizing a canvas wipes it, so a resize always paints straight away
       rather than waiting for a frame that a paused loop will not ask for. */
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
      if (!still) start();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);
    const onVisibility = () => !document.hidden && start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [focus, intensity]);

  return <canvas ref={canvasRef} aria-hidden className={cn("pointer-events-none h-full w-full", className)} />;
}
