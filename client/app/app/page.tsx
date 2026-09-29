import type { Metadata } from "next";
import { AppDemo, type ViewId } from "@/components/app";

export const metadata: Metadata = { title: "Corral · Unibox" };
const VIEWS: ViewId[] = ["unibox", "companies", "contacts", "segments", "sequences", "products", "knowledge", "settings"];

/**
 * /app — the M1 shell with the Unibox as home.
 * Deep links (for review and screenshots): ?cmdk=1 opens ⌘K · ?view=companies · ?collapsed=1 · ?nav=1 (mobile drawer) · ?dialog=enroll
 */
export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  const view = VIEWS.find((v) => v === one("view")) ?? "unibox";
  return <AppDemo initialView={view} cmdk={one("cmdk") === "1"} collapsed={one("collapsed") === "1"} drawer={one("nav") === "1"} dialog={one("dialog") === "enroll"} />;
}
