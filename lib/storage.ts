import "server-only";

import { randomBytes } from "crypto";
import path from "path";

import {
  blobDriver,
  contentMatches,
  diskDriver,
  EXTENSION_FOR_TYPE,
  keyFromSegments,
  MAX_UPLOAD_BYTES,
  type BlobClient,
  type StoredFile,
  type UploadDriver,
} from "@/lib/storage-drivers";

/**
 * Where uploaded files go.
 *
 * Every caller goes through `store()` and `readUpload()` rather than touching a
 * filesystem or a bucket directly, so where the bytes live is decided in one
 * place — see lib/storage-drivers.ts. With BLOB_READ_WRITE_TOKEN set, a private
 * Vercel Blob store; without it, local disk (UPLOAD_DIR, or ./storage/uploads).
 *
 * NOT PUBLIC, EITHER WAY. A payment slip, a signature at the Dar counter and an
 * expense receipt are private papers. Files are read back only through
 * /api/files, which asks who is looking and what the file belongs to — see
 * lib/file-access.ts. The URL stored on the record is `/uploads/...`;
 * middleware sends that path to the route, so records written before the move
 * keep working, and so do the files still sitting in public/uploads.
 *
 * The returned string is a URL path, never a filesystem path or a blob address,
 * so nothing downstream can be tricked into reading somewhere else.
 */

export { MAX_UPLOAD_BYTES };

export class UploadError extends Error {}

/*
  Chosen per call, not at import: the environment is read when a request needs
  it, so a build that runs without the token cannot freeze the wrong driver in.
*/
let cached: { token: string | undefined; driver: UploadDriver } | null = null;

export function uploadDriver(): UploadDriver {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
  if (cached && cached.token === token) return cached.driver;

  const driver = token
    ? blobDriver(
        /* Loaded only when a token is set, so local development never pulls it in. */
        async (): Promise<BlobClient> => await import("@vercel/blob"),
        token
      )
    : diskDriver(
        process.env.UPLOAD_DIR
          ? path.resolve(process.env.UPLOAD_DIR)
          : path.join(process.cwd(), "storage", "uploads"),
        /* Where files lived before they were moved out of the public folder. Read-only. */
        [path.join(process.cwd(), "public", "uploads")]
      );
  cached = { token, driver };
  return driver;
}

export async function store(file: File, folder: string): Promise<string> {
  if (file.size === 0) throw new UploadError("That file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError("That file is larger than 12 MB.");
  }

  const extension = EXTENSION_FOR_TYPE.get(file.type);
  if (!extension) {
    throw new UploadError("Only images and PDFs can be uploaded.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!contentMatches(file.type, bytes.subarray(0, 16))) {
    throw new UploadError("That file is not the image or PDF it says it is.");
  }

  /*
    THE NAME IS OURS, NOT THEIRS.

    A filename arrives from a browser and can contain anything — "../../.env" is
    a valid string. Generating the name outright means no user input reaches a
    path at all, and the folder is checked against a whitelist by the caller
    being a literal in our own code.
  */
  const safeFolder = folder.replace(/[^a-z0-9-]/gi, "");
  const name = `${Date.now()}-${randomBytes(12).toString("hex")}.${extension}`;

  await uploadDriver().write(`${safeFolder}/${name}`, bytes, file.type);

  return `/uploads/${safeFolder}/${name}`;
}

/**
 * The bytes behind a stored `/uploads/...` URL, or null.
 *
 * The content type comes from the extension `store()` chose after checking the
 * file's own bytes, never from what the store reports back.
 */
export async function readUpload(
  segments: string[]
): Promise<(StoredFile & { contentType: string }) | null> {
  const parsed = keyFromSegments(segments);
  if (!parsed) return null;
  const file = await uploadDriver().read(parsed.key);
  return file ? { ...file, contentType: parsed.contentType } : null;
}
