import type { Metadata } from "next";
import { SignInScreen } from "@/components/session/SignInScreen";
import { signInView } from "@/lib/auth/signInState";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Sign in · Corral" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /sign-in: WorkOS AuthKit (Google or email) through the API.
 * `?error=<code>` comes from the API callback. `?next=` is where to go afterwards.
 * Review states (outside production): ?state=sent | error (expired link) | invalid
 */
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const q = await searchParams;
  const { initial } = signInView({ state: one(q.state), error: one(q.error) }, getConfig().reviewStates);
  return <SignInScreen initial={initial} next={one(q.next) ?? null} />;
}
