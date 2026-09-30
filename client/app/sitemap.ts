import type { MetadataRoute } from "next";
import { LAUNCH, PUBLIC_ROUTES, ROUTES, SITE_URL, isConfirmed } from "@/lib/marketing/site";

/** Every public page (M10). Legal stubs join once counsel's text is in; sign-in isn't a page to find. */
export default function sitemap(): MetadataRoute.Sitemap {
  const legal: string[] = [ROUTES.terms, ROUTES.privacy, ROUTES.dpa];
  return PUBLIC_ROUTES.filter((r) => r !== ROUTES.signIn && (isConfirmed("legal") || !legal.includes(r)))
    .map((r) => ({ url: `${SITE_URL}${r}`, lastModified: LAUNCH }));
}
