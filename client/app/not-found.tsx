import type { Metadata } from "next";
// Deep imports on purpose (see app/error.tsx).
import "@/components/marketing/site/styles";
import "@/components/marketing/landing-v/landing-v.css";
import { Footer, Nav } from "@/components/marketing/landing-v/Sections";
import { NotFoundBody } from "@/components/marketing/site/NotFound";
import { NAV, ROUTES } from "@/lib/marketing/site";

export const metadata: Metadata = { title: "Not found", robots: { index: false } };

/** Every unknown address: the home page's nav and footer around the reef, and where to go next. */
export default function NotFound() {
  return (
    <div className="theme-open-range lv" data-variant="4">
      <Nav links={NAV} ctaHref={`${ROUTES.home}#join`} />
      <div className="lv-404">
        <main id="main"><NotFoundBody /></main>
        <Footer />
      </div>
    </div>
  );
}
