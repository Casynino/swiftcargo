"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * PHOTOGRAPH THE BOXES, DON'T GO LOOKING FOR A FILE.
 *
 * A clerk at the counter has the goods in front of them and a camera in the
 * machine. "Choose files" asks them to have taken the picture already, on some
 * other device, and put it somewhere they can find — which on a warehouse
 * desktop means it never happens, and a consignment arrives in Dar with no
 * evidence of how it left China.
 *
 * So the camera opens in the page and a shot becomes a file on the form. The
 * file input is still there underneath, because a phone photo already taken, or
 * a picture from the supplier's WeChat, is a perfectly good photo too.
 *
 * The stream is stopped on every path out of here. A camera light left on after
 * the form is submitted is the kind of thing that gets a system distrusted.
 */
export function PhotoCapture({ name = "photos" }: { name?: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState<{ url: string; id: string }[]>([]);

  /*
    THE PHOTOS LIVE HERE, NOT IN THE FILE INPUT.

    A file input forgets. Choosing from the device replaces whatever it held —
    so a picture taken with the camera vanished the moment somebody attached a
    second one — and React clears it after every submit, including one the
    server refused for a missing customer, while the thumbnails stayed on
    screen promising photos that were no longer on the form. Every file is
    kept in this list and written back into the input whenever the input loses
    them.
  */
  const held = useRef<{ id: string; file: File }[]>([]);
  const sync = () => {
    const input = fileInput.current;
    if (!input) return;
    const carrier = new DataTransfer();
    for (const { file } of held.current) carrier.items.add(file);
    input.files = carrier.files;
  };
  const keep = (file: File) => {
    const id = `${Date.now()}-${held.current.length}-${file.name}`;
    held.current = [...held.current, { id, file }];
    setShots((list) => [...list, { id, url: URL.createObjectURL(file) }]);
  };

  useEffect(() => {
    const form = fileInput.current?.form;
    if (!form) return;
    const restore = () => setTimeout(sync, 0);
    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, []);

  const stop = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setLive(false);
  };

  useEffect(() => stop, []);

  const start = async () => {
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        /* The back camera on a phone; the only camera on a desktop. */
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      stream.current = media;
      setLive(true);
      /* Assigned after the render that mounts the element. */
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play();
        }
      });
    } catch {
      setError(
        "No camera available, or permission was refused. You can still attach a picture from this device."
      );
    }
  };

  /* The captured shot is pushed into the real file input, so the form posts one
     list of photos whether they were taken here or picked from the machine. */
  const capture = () => {
    const el = video.current;
    const input = fileInput.current;
    if (!el || !input) return;

    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext("2d")?.drawImage(el, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const filename = `receiving-${Date.now()}.jpg`;
        keep(new File([blob], filename, { type: "image/jpeg" }));
        sync();
      },
      "image/jpeg",
      0.9
    );
  };

  const drop = (id: string) => {
    held.current = held.current.filter((entry) => entry.id !== id);
    sync();
    setShots((list) => list.filter((shot) => shot.id !== id));
  };

  /* What the device dialog chose is added to what was already there. */
  const picked = () => {
    const input = fileInput.current;
    if (!input) return;
    for (const file of Array.from(input.files ?? [])) {
      if (!held.current.some((entry) => entry.file === file)) keep(file);
    }
    sync();
  };

  return (
    <div className="space-y-3">
      {live ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={video}
              playsInline
              muted
              className="max-h-80 w-full object-contain"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={capture}>
              <Camera />
              Take the picture
            </Button>
            <Button type="button" variant="ghost" onClick={stop}>
              <X />
              Close the camera
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={start}>
            <Camera />
            {shots.length > 0 ? "Take another" : "Take a photo"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus />
            Attach from this device
          </Button>
        </div>
      )}

      {shots.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {shots.map((shot) => (
            <li key={shot.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.url}
                alt=""
                className="size-20 rounded-md border object-cover"
              />
              <button
                type="button"
                onClick={() => drop(shot.id)}
                aria-label="Remove this photo"
                className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border bg-background text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Label htmlFor={name} className="sr-only">
        Photos
      </Label>
      <Input
        ref={fileInput}
        id={name}
        name={name}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={picked}
        className={live || shots.length > 0 ? "hidden" : "block"}
      />

      {error ? <p className="text-xs text-signal">{error}</p> : null}
    </div>
  );
}
