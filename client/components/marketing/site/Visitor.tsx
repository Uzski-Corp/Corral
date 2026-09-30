"use client";
/* The signed-in visitor on a marketing page (M10c): the nav's account slot. Server HTML is always the signed-out
   nav; after hydration a browser with the corral_visitor hint (lib/marketing/visitor) swaps Sign in / Start for
   the person's picture or initials and "Open app". The slot is right-aligned at a fixed height, so the swap never
   moves the page (CLS 0). No redirect: the page stays marketing. */
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { initialsOf } from "@/components/app/primitives";
import { getConfig } from "@/lib/config";
import { APP_HREF, visitorFor, type Visitor } from "@/lib/marketing/visitor";

/** `visitor` pins who is shown (the styleguide); leave it out on pages. */
type Pin = { visitor?: Visitor | null };
import { CTA, ROUTES } from "@/lib/marketing/site";

const noop = () => () => {};
const snapshot = () => `${window.location.search}\u0000${document.cookie}`;

function reviewStates(): boolean {
  try { return getConfig().reviewStates; } catch { return false; }
}

/** The visitor this browser shows, or null (signed out, or before hydration). */
export function useVisitor(pin?: Visitor | null): Visitor | null {
  const snap = useSyncExternalStore(noop, snapshot, () => "");
  const live = useMemo(() => {
    if (!snap) return null;
    const [search, cookie] = snap.split("\u0000");
    return visitorFor(search, cookie, reviewStates());
  }, [snap]);
  return pin === undefined ? live : pin;
}

/** Picture, or initials when there is none or it fails to load. Labelled once; the link next to it is the action. */
export function VisitorAvatar({ visitor, size = 28, tone }: { visitor: Visitor; size?: 28 | 32; tone?: "photo" }) {
  const [broken, setBroken] = useState<string | null>(null);
  const label = `Signed in as ${visitor.name}`;
  const cls = `mk-me${size === 32 ? " mk-me--32" : ""}${tone === "photo" ? " mk-me--photo" : ""}`;
  if (!visitor.avatarUrl || broken === visitor.avatarUrl) {
    return <span className={`${cls} mk-me--initials`} role="img" aria-label={label} title={label}>{initialsOf(visitor.name)}</span>;
  }
  const url = visitor.avatarUrl;
  // The ref catches a picture that failed before hydration (server-rendered, as on the styleguide), when onError
  // has already fired with no handler attached.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={(el) => { if (el?.complete && el.currentSrc && el.naturalWidth === 0) setBroken(url); }} className={cls} src={url} alt={label} title={label}
    width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(url)} />;
}

/** The shared pages' nav (/pricing, /security, /mcp, /changelog, /legal, 404). */
export function SiteNavAccount({ visitor }: Pin) {
  const v = useVisitor(visitor);
  if (!v) return (
    <div className="sn-nav__cta">
      <Link className="sn-nav__signin" href={ROUTES.signIn}>Sign in</Link>
      <Link className="c-btn c-btn--primary c-btn--lg" href={CTA.start}>Start with one product</Link>
    </div>
  );
  return (
    <div className="sn-nav__cta is-signed-in">
      <VisitorAvatar visitor={v} />
      <Link className="c-btn c-btn--primary c-btn--lg sn-nav__app" href={APP_HREF}>Open app</Link>
    </div>
  );
}

/** Open Range (/) nav, over the photograph. */
export function OpenRangeNavAccount({ visitor }: Pin) {
  const v = useVisitor(visitor);
  if (!v) return <div className="or-nav__cta"><Link href={ROUTES.signIn} className="or-nav__signin">Sign in</Link><a className="c-btn c-btn--ink c-btn--lg" href={CTA.walkthrough}>Book a walkthrough</a></div>;
  return <div className="or-nav__cta is-signed-in"><VisitorAvatar visitor={v} tone="photo" /><Link className="c-btn c-btn--ink c-btn--lg" href={APP_HREF}>Open app</Link></div>;
}

/** Fenceline (/fenceline) nav: Sign in is a text link there; signed in, it's the picture and an "Open app" button. */
export function FencelineNavAccount({ visitor }: Pin) {
  const v = useVisitor(visitor);
  if (!v) return null;
  return <div className="fl-nav__me"><VisitorAvatar visitor={v} /><Link className="fl-btn fl-btn--sm" href={APP_HREF}>Open app</Link></div>;
}

/** A plain "Sign in" link elsewhere on a marketing page (footer, menus, 404, Fenceline links) that reads "Open app"
    when signed in; `hideSignedIn` drops it instead (Fenceline and the small-screen menu, whose bar already says it);
    `item` wraps it in an <li>, so a dropped link leaves no empty item. */
export function AuthLink({ className, hideSignedIn, item, visitor }: { className?: string; hideSignedIn?: boolean; item?: boolean } & Pin) {
  const v = useVisitor(visitor);
  if (v && hideSignedIn) return null;
  const link = v ? <Link className={className} href={APP_HREF}>Open app</Link> : <Link className={className} href={ROUTES.signIn}>Sign in</Link>;
  return item ? <li>{link}</li> : link;
}
