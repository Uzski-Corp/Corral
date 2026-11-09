/* The 404: one line on the reef and one way home. A server component, so the 404 (loaded with every route) stays small. */
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ROUTES } from "@/lib/marketing/site";

export function NotFoundBody() {
  return (
    <div className="lv-404__in lv-wrap">
      <p className="lv-404__k">404</p>
      <h1 className="lv-404__h">This page swam off.</h1>
      <p className="lv-404__p">It may have moved, or the link had a typo.</p>
      <Link className="lv-404__btn c-btn c-btn--secondary c-btn--lg" href={ROUTES.home}>Back to home<ArrowRight size={18} weight="bold" aria-hidden="true" /></Link>
    </div>
  );
}
