"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useT } from "@/components/app/locale-provider";

/**
 * CAMERA SCAN, WITH A KEYBOARD ALWAYS ONE TAP AWAY.
 *
 * The fallback is not a nicety: warehouse phones lose camera permission,
 * labels get scuffed, and cheap handsets focus badly. A clerk must always be
 * able to finish the job by typing the code, so the manual field sits under
 * the camera rather than behind a second screen.
 *
 * `@zxing/browser` is loaded on first press, not on page load — a scan screen
 * opened to type a number by hand should not pay for a camera library it never
 * touches.
 */
export function QrScanner({
  onResult,
  label = "Scan the QR code",
}: {
  onResult: (value: string) => void;
  label?: string;
}) {
  const tx = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => () => controlsRef.current?.stop(), []);

  async function start() {
    setError(null);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current ?? undefined,
        (result) => {
          if (!result) return;
          const text = result.getText();
          controls.stop();
          controlsRef.current = null;
          setActive(false);
          onResult(text);
        }
      );
      controlsRef.current = controls;
      setActive(true);
    } catch {
      setError(
        "Could not open the camera. Check the browser's camera permission, or type the code below."
      );
      setActive(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border bg-black/90">
        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
        {!active ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted text-center">
            <Camera className="size-8 text-muted-foreground/60" />
            <p className="px-6 text-sm text-muted-foreground">{tx(label)}</p>
            {/* Pressed for every consignment, all day, on a phone held in one
                hand — a small control is the wrong control here. */}
            <Button type="button" size="lg" className="h-11" onClick={start}>
              {tx("Start camera")}
            </Button>
          </div>
        ) : (
          <>
            <div className="pointer-events-none absolute inset-x-8 inset-y-10 rounded-lg border-2 border-white/70" />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute bottom-3 right-3"
              onClick={stop}
            >
              <CameraOff className="mr-1.5 size-4" />
              {tx("Stop")}
            </Button>
          </>
        )}
      </div>

      {error ? (
        <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          {tx(error)}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="manual-code" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Keyboard className="size-3.5" />
          {tx("Or type / paste the code")}
        </label>
        <div className="flex gap-2">
          <Input
            id="manual-code"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="SC0125"
            className="tnum font-mono text-sm"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (manual.trim()) onResult(manual.trim());
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => manual.trim() && onResult(manual.trim())}
          >
            {tx("Use")}
          </Button>
        </div>
      </div>
    </div>
  );
}
