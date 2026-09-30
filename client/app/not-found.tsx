import type { Metadata } from "next";
// Deep imports on purpose (see app/error.tsx).
import "@/components/marketing/site/styles";
import { SiteFooter, SiteNav } from "@/components/marketing/site/Chrome";
import { NotFoundBody } from "@/components/marketing/site/NotFound";

export const metadata: Metadata = { title: "Not found", robots: { index: false } };

/** Every unknown address (M10): the marketing chrome, and where to go next. */
export default function NotFound() {
  return (
    <div className="theme-open-range sn">
      <SiteNav />
      <main id="main"><NotFoundBody /></main>
      <SiteFooter />
    </div>
  );
}
