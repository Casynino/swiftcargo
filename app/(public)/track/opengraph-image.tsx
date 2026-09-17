/**
 * The share card for /track.
 *
 * The drawing itself is lib/track-share-card.tsx, because the same picture has
 * to be served from two route segments: a file-based Open Graph image belongs
 * to the segment it sits in, and a child segment that declares its own
 * `openGraph` — which /track/[code] does, to greet the customer by language
 * rather than by reference — does not inherit it.
 */
export { alt, size, contentType, default } from "@/lib/track-share-card";

export const runtime = "nodejs";
