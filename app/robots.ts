import type { MetadataRoute } from "next";

import { publicSiteUrl } from "@/lib/site-url";

/**
 * What crawlers may look at.
 *
 * The staff app, the portal and sign-in are closed. So is every tracking result:
 * references run in sequence, and a crawler that indexed one would happily walk
 * the rest.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await publicSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/portal/", "/api/", "/login", "/register", "/t/", "/track/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
