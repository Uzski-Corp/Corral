import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/components/marketing/site/styles";
import { LEGAL, LegalPage, type LegalDoc } from "@/components/marketing/site/Legal";
import { isConfirmed } from "@/lib/marketing/site";

const DOCS = Object.keys(LEGAL) as LegalDoc[];
const isDoc = (d: string): d is LegalDoc => (DOCS as string[]).includes(d);

export function generateStaticParams() { return DOCS.map((doc) => ({ doc })); }
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  if (!isDoc(doc)) return {};
  // Stubs stay out of search until counsel's text is in (lib/marketing/site.ts CLAIMS "legal").
  return { title: LEGAL[doc].title, description: LEGAL[doc].lede, robots: isConfirmed("legal") ? undefined : { index: false, follow: true }, alternates: { canonical: `/legal/${doc}` } };
}

export default async function Page({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  if (!isDoc(doc)) notFound();
  return <LegalPage doc={doc} />;
}
