import type { Metadata } from "next";
import { viewTitle } from "@/lib/appPath";
import { renderAppPage } from "@/lib/appPage";
import type { AppSearch } from "@/lib/appPath";

export const metadata: Metadata = { title: viewTitle("settings") };

export default async function Page({ searchParams }: { searchParams: Promise<AppSearch> }) {
  return renderAppPage("settings", searchParams, { tab: "docs" });
}
