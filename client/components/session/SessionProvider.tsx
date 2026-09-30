"use client";
/**
 * Session for the signed-in surfaces (/app, /onboarding).
 *
 * - Confirms the session with GET /me on mount. 401 sends the user to sign-in with a return path.
 *   Other failures keep the (optimistically rendered) shell and retry on the next keep-alive.
 * - Keeps the session fresh: POST /refresh every `refreshEveryMs` while the tab is visible, and
 *   when a tab that has been hidden for longer comes back.
 * - Sign out: POST /logout, then a full navigation to the WorkOS logout URL it returns.
 *
 * - Keeps the marketing pages' signed-in hint (the `corral_visitor` cookie, M10c) in step: remembered with the
 *   person's name and picture whenever /me succeeds, forgotten on sign-out and on any 401.
 *
 * In the design-review build (`NEXT_PUBLIC_DESIGN_REVIEW=1`) there is no network at all:
 * `account` is null so the shell shows Bau's sample person, and sign-out goes to /sign-in.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authApiFor, displayName, roleLabel, type AuthApi, type Me } from "@/lib/api";
import type { ApiError } from "@/lib/api/errors";
import { getConfig, type ClientConfig } from "@/lib/config";
import { err, ok, type Result } from "@/lib/result";
import { signInUrl } from "@/lib/auth/paths";
import { forgetVisitor, rememberVisitor } from "@/lib/marketing/visitor";

/** What the shell shows for the signed-in person and workspace. */
export type ShellAccount = {
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  workspace: string;
};

export type SessionStatus = "review" | "loading" | "authenticated" | "error";

export type SessionValue = {
  status: SessionStatus;
  me: Me | null;
  /** null in review mode and while loading. */
  account: ShellAccount | null;
  error: ApiError | null;
  signOut(): Promise<Result<void, ApiError>>;
  refresh(): Promise<Result<void, ApiError>>;
  /** This deploy's config, so the app's data layer talks to the same API as the session. */
  config: ClientConfig;
};

export type Navigator = { assign(url: string): void; replace(url: string): void };

const Ctx = createContext<SessionValue | null>(null);

/** The session, or null outside a SessionProvider (the styleguide renders the shell without one). */
export const useSession = () => useContext(Ctx);

export const DEFAULT_REFRESH_EVERY_MS = 10 * 60 * 1000;

export function toAccount(me: Me): ShellAccount {
  return {
    name: displayName(me.user),
    email: me.user.email,
    role: roleLabel(me.role),
    avatarUrl: me.user.profilePictureUrl,
    workspace: me.organization.name,
  };
}

const browserNavigator: Navigator = {
  assign: (url) => window.location.assign(url),
  replace: (url) => window.location.replace(url),
};

const here = () => `${window.location.pathname}${window.location.search}`;

export type SessionProviderProps = {
  children: ReactNode;
  config?: ClientConfig;
  api?: AuthApi;
  navigator?: Navigator;
  refreshEveryMs?: number;
};

export function SessionProvider({ children, config: configProp, api: apiProp, navigator = browserNavigator, refreshEveryMs = DEFAULT_REFRESH_EVERY_MS }: SessionProviderProps) {
  const config = useMemo(() => configProp ?? getConfig(), [configProp]);
  const api = useMemo(() => apiProp ?? (config.mode === "live" ? authApiFor(config) : null), [apiProp, config]);
  const router = useRouter();
  const review = config.mode === "review" || api === null;

  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<SessionStatus>(review ? "review" : "loading");
  const lastRefresh = useRef(0);
  const leaving = useRef(false);

  const toSignIn = useCallback(() => {
    forgetVisitor();
    if (leaving.current) return;
    leaving.current = true;
    navigator.replace(signInUrl(here()));
  }, [navigator]);

  const applyMe = useCallback((r: Result<Me, ApiError>) => {
    if (r.ok) {
      setMe(r.value); setError(null); setStatus("authenticated"); lastRefresh.current = Date.now();
      rememberVisitor({ name: displayName(r.value.user), avatarUrl: r.value.user.profilePictureUrl });
      return;
    }
    if (r.error.kind === "aborted") return;
    if (r.error.kind === "unauthorized") { toSignIn(); return; }
    setError(r.error);
    setStatus((s) => (s === "authenticated" ? s : "error"));
  }, [toSignIn]);

  const load = useCallback(async () => { if (api) applyMe(await api.me()); }, [api, applyMe]);

  useEffect(() => {
    if (!api || review) return;
    const c = new AbortController();
    void api.me(c.signal).then((r) => { if (!c.signal.aborted) applyMe(r); });
    return () => c.abort();
  }, [api, review, applyMe]);

  const refresh = useCallback(async (): Promise<Result<void, ApiError>> => {
    if (!api) return ok(undefined);
    const r = await api.refresh();
    if (r.ok) {
      lastRefresh.current = Date.now();
      // A session that was unconfirmed (API down at mount) gets its /me now.
      if (!me) await load();
      return ok(undefined);
    }
    if (r.error.kind === "unauthorized") toSignIn();
    else setError(r.error);
    return err(r.error);
  }, [api, me, load, toSignIn]);

  useEffect(() => {
    if (review) return;
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const id = setInterval(tick, refreshEveryMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh.current >= refreshEveryMs) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [review, refresh, refreshEveryMs]);

  const signOut = useCallback(async (): Promise<Result<void, ApiError>> => {
    if (!api) { router.push("/sign-in"); return ok(undefined); }
    const r = await api.logout();
    if (!r.ok) {
      if (r.error.kind === "unauthorized") forgetVisitor();
      return err(r.error);
    }
    forgetVisitor();
    leaving.current = true;
    navigator.assign(r.value.logoutUrl);
    return ok(undefined);
  }, [api, navigator, router]);

  const value = useMemo<SessionValue>(() => ({
    status, me, error, signOut, refresh, config,
    account: me ? toAccount(me) : null,
  }), [status, me, error, signOut, refresh, config]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
