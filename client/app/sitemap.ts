import type { MetadataRoute } from "next";
import { LAUNCH, SITE_URL, sitemapRoutes } from "@/lib/marketing/site";

/** Every public page (M10, ENG-87): `/` is the Open Range landing; the rules are in sitemapRoutes(). */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapRoutes().map((r) => ({ url: `${SITE_URL}${r}`, lastModified: LAUNCH }));
}
