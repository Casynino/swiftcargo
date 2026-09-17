import type { MetadataRoute } from "next";

import { publicSiteUrl } from "@/lib/site-url";

/**
 * The pages a stranger should land on, and nothing behind a sign-in or a
 * tracking reference.
 */
const PAGES: [path: string, priority: number, frequency: MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
  ["", 1, "weekly"],
  ["/track", 0.9, "monthly"],
  ["/rates", 0.9, "weekly"],
  ["/quote", 0.8, "monthly"],
  ["/schedule", 0.8, "daily"],
  ["/services", 0.8, "monthly"],
  ["/calculator", 0.7, "monthly"],
  ["/china", 0.7, "monthly"],
  ["/book", 0.7, "monthly"],
  ["/pickup", 0.6, "monthly"],
  ["/about", 0.6, "monthly"],
  ["/contact", 0.6, "monthly"],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await publicSiteUrl();
  return PAGES.map(([path, priority, changeFrequency]) => ({
    url: `${base}${path}`,
    changeFrequency,
    priority,
  }));
}
