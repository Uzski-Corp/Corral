"use client";
import { useCallback, useMemo } from "react";
import { AppDemo, type AppDemoProps } from "@/components/app/AppDemo";
import type { SessionUnavailableProps } from "@/components/app/SessionUnavailable";
import type { ShellAccountProp } from "@/components/app/Shell";
import type { ApiError } from "@/lib/api/errors";
import type { AppReviewState } from "@/lib/auth/appState";
import { AppSkeleton } from "@/components/app/States";
import { SessionUnavailable } from "@/components/app/SessionUnavailable";
import { useSession, type SessionValue } from "./SessionProvider";
import { AppDataProvider, appDataFor } from "./AppData";

/** What the shell shows for the account: the sample person in review, skeletons until /me lands,
 *  and a static "not connected" row once the check has failed without ever confirming a session. */
export function shellAccount(session: SessionValue | null): ShellAccountProp {
  if (!session || session.status === "review") return undefined;
  if (session.account) return session.account;
  return session.status === "error" ? "unavailable" : "loading";
}

/** "GET /api/v1/auth/me · 503" style detail for the fallback, from the error that caused it. */
export function sessionErrorDetail(e: ApiError | null): string | undefined {
  if (!e) return undefined;
  if ("status" in e) return `${e.op} · ${e.status}`;
  if (e.kind === "timeout") return `${e.op} · timed out after ${Math.round(e.timeoutMs / 1000)}s`;
  return `${e.op} · ${e.kind}`;
}

const SAMPLE_NO_AVATAR = { name: "Amani Odhiambo", email: "amani@coldtrace.io", role: "Member", avatarUrl: null, workspace: "ColdTrace" };
const hhmm = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** /app: Bau's shell bound to the real session (account menu, workspace switcher, sign out). */
export function AppScreen({ preview, ...props }: Omit<AppDemoProps, "account" | "onSignOut" | "sessionError"> & { preview?: AppReviewState }) {
  const session = useSession();
  const onSignOut = useCallback(async () => {
    if (!session) return { ok: true };
    const r = await session.signOut();
    return { ok: r.ok };
  }, [session]);

  // Live: the check failed and no session was ever confirmed. Retrying goes through refresh(),
  // which re-fetches /me once the API answers (SessionProvider).
  const liveError = session && session.status === "error" && !session.account;
  const sessionError = useMemo<SessionUnavailableProps | undefined>(() => {
    if (preview === "api-down") return { onRetry: () => new Promise<boolean>((r) => setTimeout(() => r(false), 900)), checkedAt: "23:14" };
    if (!liveError || !session) return undefined;
    return { detail: sessionErrorDetail(session.error), checkedAt: hhmm(), onRetry: async () => (await session.refresh()).ok };
  }, [preview, liveError, session]);

  // Real data once /me has confirmed who is signed in; until then (and in review) Bau's sample data.
  const me = session?.status === "authenticated" ? session.me : null;
  const config = session?.config;
  const data = useMemo(() => (me && config && !preview ? appDataFor(me, config) : null), [me, config, preview]);

  if (preview) {
    const account: ShellAccountProp = preview === "api-down" ? "unavailable" : preview === "account-loading" ? "loading" : preview === "no-avatar" ? SAMPLE_NO_AVATAR : undefined;
    const fail = preview === "signout-failed" ? async () => { await new Promise((r) => setTimeout(r, 500)); return { ok: false }; } : undefined;
    return <AppDemo {...props} account={account} onSignOut={fail} sessionError={sessionError} />;
  }
  // A live session must resolve before mounting any data-dependent dashboard.
  if (session && session.status !== "review" && !data) {
    if (sessionError) return <div className="c-shellbox c-shellbox--viewport"><SessionUnavailable {...sessionError} /></div>;
    return <AppSkeleton frame={props.frame} label="Loading your workspace" />;
  }
  return (
    <AppDataProvider value={data}>
      <AppDemo {...props} account={shellAccount(session)} onSignOut={session ? onSignOut : undefined} sessionError={sessionError} />
    </AppDataProvider>
  );
}
