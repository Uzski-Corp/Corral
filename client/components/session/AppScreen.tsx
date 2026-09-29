"use client";
import { useCallback } from "react";
import { AppDemo, type AppDemoProps, type ShellAccountProp } from "@/components/app";
import { useSession, type SessionValue } from "./SessionProvider";

/** What the shell shows for the account: the sample person in review, skeletons until /me lands. */
export function shellAccount(session: SessionValue | null): ShellAccountProp {
  if (!session || session.status === "review") return undefined;
  return session.account ?? "loading";
}

/** /app: Bau's shell bound to the real session (account menu, workspace switcher, sign out). */
export function AppScreen(props: Omit<AppDemoProps, "account" | "onSignOut">) {
  const session = useSession();
  const onSignOut = useCallback(async () => {
    if (!session) return { ok: true };
    const r = await session.signOut();
    return { ok: r.ok };
  }, [session]);
  return <AppDemo {...props} account={shellAccount(session)} onSignOut={session ? onSignOut : undefined} />;
}
