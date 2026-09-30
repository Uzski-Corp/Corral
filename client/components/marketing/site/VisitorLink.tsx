"use client";
/* A marketing CTA whose destination follows the signed-in hint (M10c, HANDOFF §18 question 5, decided by Aegon):
   signed out it goes to `href` (sign-in), signed in to `signedInHref` (/app). Same element, class and words either way,
   so nothing moves; the server HTML is the signed-out link, and the href swaps after hydration like the nav does. */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Visitor } from "@/lib/marketing/visitor";
import { useVisitor } from "./Visitor";

export function VisitorLink({ href, signedInHref, className, children, visitor }: {
  href: string; signedInHref: string; className?: string; children: ReactNode;
  /** Pins who is shown (tests, the styleguide); leave it out on pages. */ visitor?: Visitor | null;
}) {
  const v = useVisitor(visitor);
  return <Link className={className} href={v ? signedInHref : href}>{children}</Link>;
}
