"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { ImagePlus } from "lucide-react";

import { uploadCargoPhotos, type ActionState } from "@/lib/actions/cargo";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import { useT } from "@/components/app/locale-provider";
const KINDS = [
  ["PACKAGE", "Package"],
  ["SHIPPING_MARK", "Shipping mark"],
  ["LABEL", "Label"],
  ["CONDITION", "Condition"],
  ["DAMAGE", "Damage"],
  ["RECEIVING_EVIDENCE", "Receiving evidence"],
  ["RELEASE_EVIDENCE", "Release evidence"],
  ["OTHER", "Other"],
] as const;

type Photo = {
  id: string;
  url: string;
  kind: string;
  caption: string | null;
  takenAt: string;
  uploadedBy: string | null;
};

export function PhotoPanel({
  cargoId,
  photos,
  canUpload,
}: {
  cargoId: string;
  photos: Photo[];
  canUpload: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    uploadCargoPhotos,
    {}
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id} className="overflow-hidden rounded-lg border">
              <a href={photo.url} target="_blank" rel="noreferrer">
                <span className="relative block aspect-square bg-secondary">
                  <Image
                    src={photo.url}
                    alt={photo.caption ?? photo.kind}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover"
                    /* Straight from the browser, with its session. The optimiser
                       fetches without one, and an evidence photo is not public. */
                    unoptimized
                  />
                </span>
              </a>
              <div className="p-2">
                <p className="text-xs font-medium">
                  {KINDS.find(([k]) => k === photo.kind)?.[1] ?? photo.kind}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {photo.takenAt}
                  {photo.uploadedBy ? ` · ${photo.uploadedBy}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{tx("No photos yet.")}</p>
      )}

      {canUpload ? (
        open ? (
          <form action={action} className="space-y-3 rounded-lg border p-4">
            <input type="hidden" name="cargoId" value={cargoId} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="kind">{tx("What is this a photo of?")}</Label>
                <NativeSelect id="kind" name="kind" defaultValue="PACKAGE">
                  {KINDS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="caption">{tx("Caption")}</Label>
                <Input id="caption" name="caption" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="photos">{tx("Photos")}</Label>
              <Input
                id="photos"
                name="photos"
                type="file"
                accept="image/*"
                multiple
                required
                /* capture opens the camera straight away on a warehouse phone,
                   which is where almost every one of these is taken. */
                capture="environment"
              />
            </div>
            <FormMessage error={state.error} ok={state.ok} />
            <div className="flex gap-2">
              <SubmitButton pendingLabel={tx("Uploading…")}>{tx("Upload")}</SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {tx("Cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <ImagePlus />
            {tx("Add photos")}
          </Button>
        )
      ) : null}
    </div>
  );
}
