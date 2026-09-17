"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";

/**
 * The customer's own photographs of their cargo, on the public page.
 *
 * A thumbnail linking straight at the file means leaving the page for a raw
 * image in a new tab, with no way back and no way to keep it. A customer
 * checking whether the boxes in the picture are theirs needs to SEE it, and a
 * customer arguing about a crushed carton needs to keep it. So: a tap target
 * worth tapping, a full-screen view that fits the image to the phone, and a
 * real download.
 *
 * Every url already carries this consignment's reference — that is what opens
 * the file without a session (see lib/file-access.ts), so it is carried into
 * the download link too.
 */
export function CargoPhotos({
  photos,
  reference,
}: {
  photos: { id: string; url: string; caption: string | null }[];
  reference: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  /* Escape closes it, the arrows walk it, and the page behind stops scrolling
     under the viewer. */
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") {
        setOpen((i) => (i === null ? null : (i + 1) % photos.length));
      }
      if (e.key === "ArrowLeft") {
        setOpen((i) => (i === null ? null : (i - 1 + photos.length) % photos.length));
      }
    };
    document.addEventListener("keydown", onKey);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [open, photos.length]);

  if (photos.length === 0) return null;

  const shown = open === null ? null : photos[open];

  const viewer =
    shown && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-50 flex flex-col bg-black/90"
            onClick={() => setOpen(null)}
          >
            <div className="flex items-center justify-between gap-3 p-3">
              <span className="tnum text-xs text-white/70">
                {reference}
                {photos.length > 1 ? ` · ${open! + 1}/${photos.length}` : ""}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={`${shown.url}${shown.url.includes("?") ? "&" : "?"}download=1`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
                >
                  <Download className="size-3.5" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  aria-label="Close"
                  className="rounded-md bg-white/15 p-1.5 text-white hover:bg-white/25"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            {/* Plain img: an upload from a warehouse phone, of unknown
                dimensions, served through the access-checked file route the
                image optimiser cannot sign in to. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shown.url}
              alt={shown.caption ?? `Cargo photo for ${reference}`}
              onClick={(e) => e.stopPropagation()}
              className="mx-auto min-h-0 w-auto max-w-full flex-1 object-contain p-2"
            />
            {photos.length > 1 ? (
              <div className="flex justify-center gap-2 p-3">
                {photos.map((photo, i) => (
                  <button
                    key={photo.id}
                    type="button"
                    aria-label={`Photo ${i + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(i);
                    }}
                    className={`h-1.5 w-6 rounded-full ${
                      i === open ? "bg-white" : "bg-white/30"
                    }`}
                  />
                ))}
              </div>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`Open photo ${i + 1} of ${photos.length}`}
            className="block aspect-square overflow-hidden rounded-lg border transition-transform hover:scale-[1.02] motion-reduce:hover:scale-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.caption ?? `Cargo photo for ${reference}`}
              className="size-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      {viewer}
    </>
  );
}
