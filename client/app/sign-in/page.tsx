import type { Metadata } from "next";
import { SignIn, type SignInState } from "@/components/app/screens/SignIn";

export const metadata: Metadata = { title: "Sign in · Corral" };
const STATES: SignInState[] = ["default", "sent", "error", "invalid"];

/** /sign-in — email magic link + Google. Review states: ?state=sent | error (expired link) | invalid */
export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const s = (await searchParams).state;
  const initial = STATES.find((x) => x === s) ?? "default";
  return <SignIn key={initial} initial={initial} />;
}
