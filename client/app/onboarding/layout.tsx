import { SessionProvider } from "@/components/session/SessionProvider";

/** Onboarding needs a session too: proxy.ts checks the cookie, SessionProvider confirms it. */
export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return <SessionProvider>{children}</SessionProvider>;
}
