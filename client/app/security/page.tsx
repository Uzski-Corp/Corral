import type { Metadata } from "next";
import "@/components/marketing/site/styles";
import { SecurityPage } from "@/components/marketing/site/Security";

export const metadata: Metadata = {
  title: "Security",
  description: "What Corral can touch and what it can’t: drafts you send, your own mailboxes, scoped keys that never send, and every call logged.",
  alternates: { canonical: "/security" },
};
export default function Page() { return <SecurityPage />; }
