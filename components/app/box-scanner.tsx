"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, ScanLine, XCircle } from "lucide-react";

import { scanBoxAtDar, scanBoxForRelease, type BoxScanState } from "@/lib/actions/boxes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Logged = { at: number; tone: "ok" | "warning" | "error"; text: string };

/**
 * A SCANNER THAT STAYS READY.
 *
 * A warehouse scanner types the code and presses Enter. The box clears and
 * keeps its focus after every scan, so a clerk works down a pallet without
 * touching the screen; the answer for the box in their hand is shown large, in
 * green, amber or red, and the last scans run down underneath.
 */
export function BoxScanner({
  mode,
  containerId,
  cargoId,
  initial,
}: {
  mode: "dar" | "release";
  containerId?: string;
  cargoId?: string;
  initial?: { done: number; total: number };
}) {
  const action = mode === "dar" ? scanBoxAtDar : scanBoxForRelease;
  const [state, submit, pending] = useActionState<BoxScanState, FormData>(action, {});
  const [code, setCode] = useState("");
  const [log, setLog] = useState<Logged[]>([]);
  const input = useRef<HTMLInputElement | null>(null);
  const progress = state.progress ?? initial;

  useEffect(() => {
    if (!state.at) return;
    const tone: Logged["tone"] = state.error ? "error" : state.warning ? "warning" : "ok";
    const text = state.error ?? state.warning ?? state.ok ?? "";
    setLog((rows) => [{ at: state.at!, tone, text }, ...rows].slice(0, 12));
    setCode("");
    input.current?.focus();
    if (tone !== "ok" && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(200);
  }, [state.at, state.error, state.warning, state.ok]);

  const tone = state.error ? "error" : state.warning ? "warning" : state.ok ? "ok" : null;
  const Icon = tone === "error" ? XCircle : tone === "warning" ? CircleAlert : CheckCircle2;

  return (
    <div className="space-y-4">
      <form action={submit} className="flex gap-2">
        {containerId ? <input type="hidden" name="containerId" value={containerId} /> : null}
        {cargoId ? <input type="hidden" name="cargoId" value={cargoId} /> : null}
        <Input
          ref={input}
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoComplete="off"
          placeholder={mode === "dar" ? "Scan a box label…" : "Scan each box as it goes out…"}
          className="h-12 text-base"
        />
        <Button type="submit" size="lg" disabled={pending || !code.trim()}>
          <ScanLine />
          {pending ? "Checking…" : "Scan"}
        </Button>
      </form>

      {progress ? (
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {mode === "dar" ? "Boxes received from this container" : "Boxes handed over"}
            </span>
            <span className="tnum font-semibold text-foreground">
              {progress.done} of {progress.total}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      ) : null}

      {tone ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4 text-sm font-medium",
            tone === "ok" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
            tone === "warning" && "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
            tone === "error" && "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200"
          )}
        >
          <Icon className="mt-0.5 size-5 shrink-0" />
          <span>{state.error ?? state.warning ?? state.ok}</span>
        </div>
      ) : null}

      {log.length > 1 ? (
        <ul className="divide-y rounded-lg border text-xs">
          {log.slice(1).map((row) => (
            <li key={row.at} className="flex items-start gap-2 px-3 py-2">
              <span
                className={cn(
                  "mt-1 size-2 shrink-0 rounded-full",
                  row.tone === "ok" ? "bg-emerald-500" : row.tone === "warning" ? "bg-amber-500" : "bg-red-500"
                )}
              />
              <span className="text-muted-foreground">{row.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
