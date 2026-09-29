import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/session/OnboardingScreen";

export const metadata: Metadata = { title: "Set up your workspace · Corral" };

/** /onboarding — five steps. Review states: ?step=1…6 (6 = done) · ?skipped=3,4 · ?crawl=done · ?mailbox=1 */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const q = await searchParams;
  const one = (k: string) => { const v = q[k]; return Array.isArray(v) ? v[0] : v; };
  const step = Math.min(6, Math.max(1, Number(one("step")) || 1));
  const skipped = (one("skipped") ?? "").split(",").map(Number).filter((n) => n >= 3 && n <= 5 && n < step);
  return <OnboardingScreen key={`${step}-${skipped.join()}`} initialStep={step} skipped={skipped} crawl={one("crawl") === "done" ? "done" : "idle"} connected={one("mailbox") === "1"} />;
}
