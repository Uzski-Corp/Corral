"use client";
import { Onboarding, type OnboardingProps } from "@/components/app/screens/Onboarding";
import { markOnboarded } from "@/lib/auth/cookies";
import { PersistentOnboarding } from "./PersistentOnboarding";
import { useSession } from "./SessionProvider";

/**
 * /onboarding. In the design-review build this is the sample flow. Signed in, it loads and
 * saves the workspace, and leaving for the app marks this browser onboarded.
 */
export function OnboardingScreen(props: Omit<OnboardingProps, "onExit" | "live">) {
  const session = useSession();
  // No session (styleguide, tests) and the design-review build keep the sample flow.
  if (!session || session.config.mode === "review") {
    return <Onboarding {...props} onExit={() => markOnboarded()} />;
  }
  if (session.status === "authenticated" && session.me) {
    return <PersistentOnboarding me={session.me} />;
  }
  const message = session.status === "error"
    ? (session.error?.message ?? "Couldn't load your workspace.")
    : "Loading your workspace";
  return <div className="s-onb c-app"><main className="s-onb__main"><p className="c-muted" style={{ padding: 28 }}>{message}</p></main></div>;
}
