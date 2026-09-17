"use client";

import { useEffect } from "react";

import { t } from "@/lib/i18n";

/**
 * Keeps a form with photos under the size a request may be.
 *
 * On Vercel a request to a function cannot exceed 4.5 MB, whatever the server
 * action allows, and the platform rejects a bigger one before the app sees it —
 * the clerk gets a generic failure and the receiving is lost. Two photos from a
 * modern phone are already past that.
 *
 * So at submit, and only when the files in a form add up to more than the
 * request can carry, the larger images are redrawn smaller as JPEG in the
 * browser before the form goes. A form under the budget is never touched: its
 * photos arrive exactly as taken. PDFs are never altered. If the form is still
 * too large, the clerk is told so and the form is not sent, which is better
 * than a failure that looks like a server fault.
 *
 * One listener on the document rather than a change to every upload form: the
 * receiving counter, payment slips, expense receipts, case evidence and the
 * portal all post files the same way, through a native form submit.
 */

type Pass = { minBytes: number; maxEdge: number; quality: number };

const PASSES: Pass[] = [
  { minBytes: 1_000_000, maxEdge: 2560, quality: 0.85 },
  { minBytes: 400_000, maxEdge: 1600, quality: 0.8 },
];

const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

/* Marks a form resubmitted after shrinking, so the second submit goes through. */
const READY = "uploadBudgetReady";

function fileInputs(form: HTMLFormElement): HTMLInputElement[] {
  return Array.from(form.elements).filter(
    (el): el is HTMLInputElement =>
      el instanceof HTMLInputElement && el.type === "file" && !el.disabled && !!el.files?.length
  );
}

function totalBytes(inputs: HTMLInputElement[]): number {
  return inputs.reduce(
    (sum, input) => sum + Array.from(input.files ?? []).reduce((s, f) => s + f.size, 0),
    0
  );
}

async function shrink(file: File, pass: Pass): Promise<File> {
  if (!RESIZABLE.has(file.type) || file.size < pass.minBytes) return file;
  try {
    /* Honours the camera's rotation flag, so a portrait photo stays upright. */
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, pass.maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", pass.quality)
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    /* A format this browser cannot decode (HEIC outside Safari) goes as it is. */
    return file;
  }
}

async function applyPass(inputs: HTMLInputElement[], pass: Pass): Promise<void> {
  for (const input of inputs) {
    const files = Array.from(input.files ?? []);
    const smaller = await Promise.all(files.map((file) => shrink(file, pass)));
    if (smaller.every((file, i) => file === files[i])) continue;
    const transfer = new DataTransfer();
    for (const file of smaller) transfer.items.add(file);
    input.files = transfer.files;
  }
}

export function UploadBudget({ limitBytes }: { limitBytes: number }) {
  useEffect(() => {
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset[READY]) {
        delete form.dataset[READY];
        return;
      }
      const inputs = fileInputs(form);
      if (inputs.length === 0 || totalBytes(inputs) <= limitBytes) return;
      if (typeof DataTransfer === "undefined" || typeof createImageBitmap === "undefined") return;

      /* Held back here, before React's own listener sees it. */
      event.preventDefault();
      event.stopImmediatePropagation();
      const submitter = event.submitter;

      void (async () => {
        try {
          for (const pass of PASSES) {
            if (totalBytes(inputs) <= limitBytes) break;
            await applyPass(inputs, pass);
          }
        } catch {
          /* Could not rewrite the file list; fall through to the size check. */
        }
        if (totalBytes(inputs) > limitBytes) {
          const mb = (limitBytes / 1_000_000).toFixed(1);
          window.alert(
            t(
              null,
              `These files are too large to send together (the limit is ${mb} MB). Remove a file or attach fewer at once, then try again.`
            )
          );
          return;
        }
        form.dataset[READY] = "1";
        form.requestSubmit(
          submitter instanceof HTMLElement && form.contains(submitter) ? submitter : undefined
        );
      })();
    };

    window.addEventListener("submit", onSubmit, true);
    return () => window.removeEventListener("submit", onSubmit, true);
  }, [limitBytes]);

  return null;
}
