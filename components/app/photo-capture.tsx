"use client";

import { useT } from "@/components/app/locale-provider";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";

/**
 * PHOTOGRAPH THE BOXES.
 *
 * Built for a phone at the counter: one tile opens the camera, one opens the
 * gallery (a photo already taken, or one from the supplier's WeChat). Both are
 * the phone's own pickers — the camera app is better at taking a picture than
 * any page could be — and everything chosen lands in one list with thumbnails.
 *
 * THE PHOTOS LIVE HERE, NOT IN THE FILE INPUT. A file input forgets: choosing
 * again replaces what it held, and React clears it after every submit, including
 * one the server refused, while the thumbnails stayed on screen promising photos
 * no longer on the form. Every file is kept in this list and written back into
 * the one input the form posts whenever that input loses them.
 */
export function PhotoCapture({ name = "photos" }: { name?: string }) {
  const t = useT();
  const posted = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const held = useRef<{ id: string; file: File }[]>([]);
  const [shots, setShots] = useState<{ url: string; id: string }[]>([]);

  const sync = () => {
    const input = posted.current;
    if (!input) return;
    const carrier = new DataTransfer();
    for (const { file } of held.current) carrier.items.add(file);
    input.files = carrier.files;
  };

  useEffect(() => {
    const form = posted.current?.form;
    if (!form) return;
    const restore = () => setTimeout(sync, 0);
    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, []);

  const add = (input: HTMLInputElement | null) => {
    if (!input?.files) return;
    for (const file of Array.from(input.files)) {
      const id = `${Date.now()}-${held.current.length}-${file.name}`;
      held.current = [...held.current, { id, file }];
      setShots((list) => [...list, { id, url: URL.createObjectURL(file) }]);
    }
    /* Emptied so the same picture can be chosen again after removing it. */
    input.value = "";
    sync();
  };

  const drop = (id: string) => {
    held.current = held.current.filter((entry) => entry.id !== id);
    sync();
    setShots((list) => list.filter((shot) => shot.id !== id));
  };

  const tile =
    "focus-ring flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-sm font-medium transition-colors";

  return (
    <div>
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        <li>
          <button
            type="button"
            onClick={() => camera.current?.click()}
            className={`${tile} w-full border-brand/50 bg-brand/[0.08] text-brand hover:bg-brand/[0.14]`}
          >
            <Camera className="size-7" />
            {shots.length > 0 ? t("Another") : t("Camera")}
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => gallery.current?.click()}
            className={`${tile} w-full text-muted-foreground hover:border-foreground/30 hover:text-foreground`}
          >
            <ImagePlus className="size-7" />
            {t("Gallery")}
          </button>
        </li>
        {shots.map((shot, index) => (
          <li key={shot.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.url}
              alt={`Photo ${index + 1}`}
              className="aspect-square w-full rounded-xl border object-cover"
            />
            <button
              type="button"
              onClick={() => drop(shot.id)}
              aria-label={`${t("Remove")} ${index + 1}`}
              className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/65 text-white backdrop-blur hover:bg-black/80"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-muted-foreground">
        {shots.length === 0
          ? t("No photo yet — at least one is needed.")
          : `${shots.length} ${t("photos ready")}`}
      </p>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => add(event.currentTarget)}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => add(event.currentTarget)}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
      <input ref={posted} name={name} type="file" multiple className="hidden" aria-hidden tabIndex={-1} />
    </div>
  );
}
