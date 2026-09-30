import type { Metadata } from "next";
import { OpenRangeLanding } from "@/components/marketing/open-range";

/** The Open Range landing at its M10 address. Since ENG-87 it is also `/`, which is the canonical copy. */
export const metadata: Metadata = {
  title: { absolute: "Corral · The right fifty, already read." },
  description: "Corral reads every company’s website against what you sell, scores the fit, and puts a real person at the end of every row.",
  alternates: { canonical: "/" },
};

export default function OpenRangePage() {
  return <OpenRangeLanding />;
}
