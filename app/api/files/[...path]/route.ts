import { NextResponse } from "next/server";

import { fileAccess } from "@/lib/file-access";
import { currentUser } from "@/lib/session";
import { readUpload } from "@/lib/storage";
import { referenceFromInput } from "@/lib/tracking";

/* Reads the upload folder or the blob store with the store token. */
export const runtime = "nodejs";

/**
 * Every uploaded file is read through here.
 *
 * Middleware rewrites `/uploads/<folder>/<name>` to this route, so the URL on
 * each record stays what it always was. What changed is that somebody is asked
 * who they are before the bytes go out — see lib/file-access.ts for who may
 * open what.
 *
 * A refusal and a missing file are the same 404. A 403 would confirm to a
 * stranger that the name they guessed belongs to a real payment slip.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const url = `/uploads/${segments.join("/")}`;
  const query = new URL(request.url).searchParams;

  const notFound = () =>
    new NextResponse("Not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });

  /* A tracking reference stands in for a session on the public tracking page,
     and opens that consignment's counter photographs only — see
     lib/file-access.ts. A reference is not a key to the upload folder. */
  const reference = referenceFromInput(query.get("ref") ?? "");

  const access = await fileAccess(url, await currentUser(), reference);
  if (!access) return notFound();

  const file = await readUpload(segments);
  if (!file) return notFound();

  const isPdf = file.contentType === "application/pdf";
  /* A phone has no "save image as". `download=1` is what actually hands
     somebody the file — the download attribute is ignored across origins, and
     the blob store serves everything inline. */
  const download = query.get("download") === "1";
  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.contentType,
      ...(file.size !== null ? { "Content-Length": String(file.size) } : {}),
      "Content-Disposition": download
        ? `attachment; filename="${segments.at(-1)?.replace(/[^\w.-]/g, "") || "file"}"`
        : "inline",
      "Cache-Control":
        access === "public" ? "public, max-age=3600" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      /* A stored file is never a page. Images get no script and no plugins;
         a PDF is left to the browser's own viewer, which a sandbox would block. */
      ...(isPdf
        ? {}
        : { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }),
    },
  });
}
