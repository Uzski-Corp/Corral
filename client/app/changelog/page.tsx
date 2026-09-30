import type { Metadata } from "next";
import "@/components/marketing/site/styles";
import { ChangelogPage } from "@/components/marketing/site/Changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What changed in Corral, and when.",
  alternates: { canonical: "/changelog" },
};
export default function Page() { return <ChangelogPage />; }
