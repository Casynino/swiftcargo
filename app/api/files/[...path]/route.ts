import { NextResponse } from "next/server";

import { fileAccess } from "@/lib/file-access";
import { currentUser } from "@/lib/session";
import { readUpload } from "@/lib/storage";

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
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const url = `/uploads/${segments.join("/")}`;

  const notFound = () =>
    new NextResponse("Not found.", {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });

  const access = await fileAccess(url, await currentUser());
  if (!access) return notFound();

  const file = await readUpload(segments);
  if (!file) return notFound();

  const isPdf = file.contentType === "application/pdf";
  return new NextResponse(file.body, {
    headers: {
      "Content-Type": file.contentType,
      ...(file.size !== null ? { "Content-Length": String(file.size) } : {}),
      "Content-Disposition": "inline",
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
