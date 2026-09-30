import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/marketing/site";

/** The app, onboarding and the design routes stay out of search (M10). */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/onboarding", "/styleguide"] }], sitemap: `${SITE_URL}/sitemap.xml` };
}
