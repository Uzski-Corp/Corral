import type { Metadata } from "next";
import { OpenRangeLanding } from "@/components/marketing/open-range";

/** The public home page (ENG-87): the Open Range landing. The design index that lived here is /styleguide/landings. */
export const metadata: Metadata = {
  title: { absolute: "Corral · The right fifty, already read." },
  description: "Corral reads every company’s website against what you sell, scores the fit, and puts a real person at the end of every row.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return <OpenRangeLanding />;
}
