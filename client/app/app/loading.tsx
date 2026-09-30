import { AppSkeleton } from "@/components/app";

/** /app while the page and the session load (M10): the shell's outline, the Unibox list in skeleton rows. */
export default function Loading() {
  return <div className="c-app"><AppSkeleton /></div>;
}
