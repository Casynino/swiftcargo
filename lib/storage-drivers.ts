import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/**
 * Where the bytes of an upload physically live.
 *
 * Two places, and nothing above this file knows which one is in use:
 *
 * - DISK, for development and a single long-lived server. A folder outside
 *   /public, because anything under /public is served to whoever has the
 *   address.
 * - VERCEL BLOB, for a serverless deployment. A function's filesystem is
 *   thrown away between requests and differs between instances, so a photo
 *   written to disk there is a 404 on the next page view.
 *
 * The blob store is PRIVATE. A public blob is served by Vercel's CDN to anybody
 * holding its address, and a payment slip must never be one leaked link away
 * from a stranger. Private blobs are fetched here, with the store token, and
 * handed out only by /api/files after lib/file-access.ts has asked who is
 * looking.
 *
 * Either way the record keeps `/uploads/<folder>/<name>`. The key under that
 * prefix is the same string in both drivers, so a record never says where it
 * was stored and the ownership lookup in lib/file-access.ts matches the URL
 * exactly as it always has.
 *
 * No `server-only` here so the drivers can be exercised by `npm test` with a
 * stand-in for the Blob SDK; lib/storage.ts is the server-only door.
 */

export type StoredFile = {
  body: Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array>;
  /** Known for a file on disk; a blob stream reports it when the store does. */
  size: number | null;
};

export interface UploadDriver {
  readonly name: "disk" | "blob";
  /** `key` is `<folder>/<name>`, already validated. */
  write(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  read(key: string): Promise<StoredFile | null>;
}

/* ---------------------------------------------------------------- disk --- */

export function diskDriver(root: string, legacyRoots: string[] = []): UploadDriver {
  const writeRoot = path.resolve(root);
  const readRoots = [writeRoot, ...legacyRoots.map((r) => path.resolve(r))];

  return {
    name: "disk",
    async write(key, bytes) {
      const full = inside(writeRoot, key);
      if (!full) throw new Error("Upload key escapes the upload folder.");
      await mkdir(path.dirname(full), { recursive: true });
      /* `wx`: a name is generated once. Finding it already there means two
         writes collided, and the second must not replace the first's evidence. */
      await writeFile(full, bytes, { flag: "wx" });
    },
    async read(key) {
      for (const root of readRoots) {
        const full = inside(root, key);
        if (!full) continue;
        try {
          const body = await readFile(full);
          return { body: new Uint8Array(body), size: body.length };
        } catch {
          /* Not under this root; try the next. */
        }
      }
      return null;
    },
  };
}

/** The resolved path, or null if the key would climb out of `root`. */
function inside(root: string, key: string): string | null {
  const full = path.resolve(root, ...key.split("/"));
  return full.startsWith(root + path.sep) ? full : null;
}

/* ---------------------------------------------------------------- blob --- */

/**
 * The two calls this app makes into `@vercel/blob`, typed narrowly so a test
 * can stand in for the SDK without a network.
 */
export interface BlobClient {
  put(
    pathname: string,
    body: Buffer,
    options: {
      access: "private";
      contentType: string;
      addRandomSuffix: false;
      allowOverwrite: false;
      token: string;
    }
  ): Promise<{ pathname: string }>;
  get(
    pathname: string,
    options: { access: "private"; token: string }
  ): Promise<
    | { statusCode: 200; stream: ReadableStream<Uint8Array>; blob: { size: number } }
    | { statusCode: 304; stream: null; blob: { size: null } }
    | null
  >;
}

/** Everything the app writes sits under this prefix in the store. */
export const BLOB_PREFIX = "uploads/";

export function blobDriver(
  loadClient: () => Promise<BlobClient>,
  token: string
): UploadDriver {
  return {
    name: "blob",
    async write(key, bytes, contentType) {
      const client = await loadClient();
      const pathname = BLOB_PREFIX + key;
      const result = await client.put(pathname, Buffer.from(bytes), {
        access: "private",
        contentType,
        /* The name already carries 96 random bits and is what the record
           stores; a suffix added by the store would break that match. */
        addRandomSuffix: false,
        allowOverwrite: false,
        token,
      });
      if (result.pathname !== pathname) {
        throw new Error("The blob store saved the upload under a different name.");
      }
    },
    async read(key) {
      const client = await loadClient();
      let result;
      try {
        result = await client.get(BLOB_PREFIX + key, { access: "private", token });
      } catch (error) {
        /* A missing blob is an ordinary 404. Anything else — a revoked token,
           the store unavailable — is an outage and must surface as one, not as
           a file that quietly stopped existing. */
        if (error instanceof Error && error.name === "BlobNotFoundError") return null;
        throw error;
      }
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return { body: result.stream, size: result.blob.size ?? null };
    },
  };
}

/* ---------------------------------------------------------- validation --- */

/** 12 MB. A phone photo is 3–6; a scanned bill of lading can be larger. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export const EXTENSION_FOR_TYPE = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["application/pdf", "pdf"],
]);

export const TYPE_FOR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
};

/*
  THE BROWSER'S WORD FOR WHAT A FILE IS, CHECKED AGAINST THE FILE.

  `file.type` is whatever the request says it is. A page of HTML declared as
  image/png would be stored and handed back to the next person who opened it,
  so the first bytes have to agree with the declared type before it is kept.
*/
export function contentMatches(type: string, head: Buffer): boolean {
  const ascii = (from: number, to: number) => head.subarray(from, to).toString("latin1");
  switch (type) {
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return head
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/heic":
      return (
        ascii(4, 8) === "ftyp" &&
        /^(heic|heix|hevc|hevx|mif1|msf1|heis|heim)$/.test(ascii(8, 12))
      );
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    default:
      return false;
  }
}

/**
 * The storage key behind a `/uploads/...` URL's segments, or null.
 *
 * Every segment is held to the shape `store()` writes — a request cannot climb
 * out with `..`, an encoded slash or an absolute path, whichever driver it
 * reaches.
 */
export function keyFromSegments(
  segments: string[]
): { key: string; contentType: string } | null {
  if (segments.length === 0 || segments.length > 2) return null;
  if (!segments.every((s) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) && !s.includes(".."))) {
    return null;
  }
  const extension = segments.at(-1)!.split(".").pop()!.toLowerCase();
  const contentType = TYPE_FOR_EXTENSION[extension];
  if (!contentType) return null;
  return { key: segments.join("/"), contentType };
}
