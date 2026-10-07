import { serializeJsonLd } from "@/lib/marketing/seo";

/** Structured data, rendered on the server as <script type="application/ld+json"> (escaped by serializeJsonLd). */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
