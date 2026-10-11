import type { MetadataRoute } from "next";
import { HOME_DESCRIPTION, ICONS, THEME } from "@/lib/marketing/seo";

/** /manifest.webmanifest. Icons are PNGs rendered from public/icon.svg (192 and 512); colours match the viewport's
    light theme-color. hosting/landing/assemble.mjs copies the built file into the Worker's assets. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corral",
    short_name: "Corral",
    description: HOME_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    theme_color: THEME.light,
    background_color: THEME.light,
    icons: ICONS.map((i) => ({ ...i, purpose: "any" })),
  };
}
