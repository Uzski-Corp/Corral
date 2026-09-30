"use client";
import { useMemo } from "react";
import { SignIn, type SignInActions, type SignInState } from "@/components/app/screens/SignIn";
import { authApiFor, toCodeSendResult, toCodeVerifyResult, type AuthApi } from "@/lib/api";
import { rememberReturnTo } from "@/lib/auth/cookies";
import { APP_HOME, POST_LOGIN_LANDING, safeReturnTo } from "@/lib/auth/paths";
import { getConfig, type ClientConfig } from "@/lib/config";

type Go = (url: string) => void;

/**
 * Google hands off to the API's AuthKit redirect. Email stays in the app (HANDOFF §9): sendCode and
 * verifyCode call the API's WorkOS Magic Auth endpoints. A verified code sets the session cookie, then
 * the page goes to "/" exactly like the AuthKit callback, so the proxy finishes the trip (return path,
 * or onboarding for a new workspace). startEmail (the AuthKit fallback) is kept for the contract.
 */
export function signInActions(auth: AuthApi, next: string | null, go: Go, remember: (path: string) => void = rememberReturnTo): SignInActions {
  const destination = () => safeReturnTo(next) ?? APP_HOME;
  const start = () => {
    remember(destination());
    go(auth.loginUrl());
  };
  return {
    startGoogle: start,
    startEmail: () => start(),
    sendCode: async (email) => toCodeSendResult(await auth.sendCode(email)),
    verifyCode: async (email, code) => {
      const r = toCodeVerifyResult(await auth.verifyCode(email, code));
      if (r.ok) {
        remember(destination());
        go(POST_LOGIN_LANDING);
      }
      return r;
    },
  };
}

export function SignInScreen({ initial, next, config: configProp, go }: { initial: SignInState; next: string | null; config?: ClientConfig; go?: Go }) {
  const actions = useMemo(() => {
    const config = configProp ?? getConfig();
    if (config.mode === "review") return undefined;
    return signInActions(authApiFor(config), next, go ?? ((url) => window.location.assign(url)));
  }, [configProp, next, go]);
  return <SignIn key={initial} initial={initial} actions={actions} />;
}
