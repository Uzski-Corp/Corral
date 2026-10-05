import type { Metadata } from "next";
import { viewTitle, type AppSearch } from "@/lib/appPath";
import { renderAppPage } from "@/lib/appPage";

export const metadata: Metadata = { title: viewTitle("segments") };

export default async function Page({ params, searchParams }: { params: Promise<{ segment: string }>; searchParams: Promise<AppSearch> }) {
  const { segment } = await params;
  return renderAppPage("segments", searchParams, { segment });
}
