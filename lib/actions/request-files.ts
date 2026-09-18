"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { formMessage } from "@/lib/safe-error";
import { authorize } from "@/lib/session";
import { store, UploadError } from "@/lib/storage";

export type FileState = { error?: string; ok?: string };

/**
 * PAPERS AND PROOF HUNG ON A WEBSITE REQUEST.
 *
 * A proforma a customer sent us, a bill of lading for a clearance job, the
 * photograph the Guangzhou driver took at the factory gate. Uploaded BY STAFF
 * ONLY, and deliberately: the request forms are the one thing a stranger may
 * write, and an anonymous upload endpoint is a free file store for anybody who
 * finds it. Customers send documents on WhatsApp against their reference and
 * whoever is working the request puts them here.
 *
 * The bytes go through lib/storage.ts like every other private paper and come
 * back only through /api/files, which asks who is looking — see
 * lib/file-access.ts.
 */

const KINDS = new Set(["DOCUMENT", "PROOF"]);

export async function attachRequestFile(
  _prev: FileState,
  formData: FormData
): Promise<FileState> {
  let actor;
  try {
    actor = await authorize("request.manage");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not permitted." };
  }

  const kind = String(formData.get("kind") ?? "DOCUMENT");
  if (!KINDS.has(kind)) return { error: "Not a kind of file we keep." };

  const label = String(formData.get("label") ?? "").trim().slice(0, 200) || null;
  const pickupRequestId = String(formData.get("pickupRequestId") ?? "") || null;
  const bookingId = String(formData.get("bookingId") ?? "") || null;
  if (!pickupRequestId && !bookingId) return { error: "Which request?" };

  /* The request has to exist before a file is stored against it: an upload
     hanging off nothing is an orphan, and lib/file-access.ts opens orphans for
     nobody. */
  const owner = pickupRequestId
    ? await prisma.pickupRequest.findUnique({
        where: { id: pickupRequestId },
        select: { reference: true },
      })
    : await prisma.containerBooking.findUnique({
        where: { id: bookingId! },
        select: { reference: true },
      });
  if (!owner) return { error: "That request no longer exists." };

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return { error: "Choose a file." };
  if (files.length > 6) return { error: "Six files at a time." };

  const stored: string[] = [];
  try {
    for (const file of files) stored.push(await store(file, "requests"));
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    return { error: formMessage(error, "That upload did not go through.") };
  }

  await prisma.requestDocument.createMany({
    data: stored.map((url) => ({
      pickupRequestId,
      bookingId,
      kind,
      label,
      url,
      uploadedById: actor.id,
    })),
  });

  await recordAudit({
    actor,
    action: "request.file.attach",
    entity: pickupRequestId ? "PickupRequest" : "ContainerBooking",
    entityId: pickupRequestId ?? bookingId,
    summary: `${owner.reference}: ${stored.length} ${kind.toLowerCase()} file${stored.length === 1 ? "" : "s"} attached${label ? ` — ${label}` : ""}`,
  });

  revalidatePath("/app/support/requests");
  return { ok: `${stored.length} file${stored.length === 1 ? "" : "s"} attached.` };
}
