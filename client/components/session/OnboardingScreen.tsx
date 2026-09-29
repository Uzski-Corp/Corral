"use client";
import { Onboarding, type OnboardingProps } from "@/components/app/screens/Onboarding";
import { markOnboarded } from "@/lib/auth/cookies";

/** /onboarding: leaving for the app marks this browser as onboarded, so /app stops redirecting here. */
export function OnboardingScreen(props: Omit<OnboardingProps, "onExit">) {
  return <Onboarding {...props} onExit={() => markOnboarded()} />;
}
