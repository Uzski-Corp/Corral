"use client";
import { useMemo } from "react";
import { SignIn, type SignInActions, type SignInState } from "@/components/app/screens/SignIn";
import { authApiFor, type AuthApi } from "@/lib/api";
import { rememberReturnTo } from "@/lib/auth/cookies";
import { APP_HOME, safeReturnTo } from "@/lib/auth/paths";
import { getConfig, type ClientConfig } from "@/lib/config";

type Go = (url: string) => void;

/**
 * Both buttons hand off to the API's AuthKit redirect. AuthKit runs the Google and email
 * (Magic Auth) flows on its hosted page; the API has no "email me a link" endpoint yet, so the
 * designed "Check your email" screen is a review state only (see the PR notes).
 */
export function signInActions(auth: AuthApi, next: string | null, go: Go, remember: (path: string) => void = rememberReturnTo): SignInActions {
  const start = () => {
    remember(safeReturnTo(next) ?? APP_HOME);
    go(auth.loginUrl());
  };
  return { startGoogle: start, startEmail: () => start() };
}

export function SignInScreen({ initial, next, config: configProp, go }: { initial: SignInState; next: string | null; config?: ClientConfig; go?: Go }) {
  const actions = useMemo(() => {
    const config = configProp ?? getConfig();
    if (config.mode === "review") return undefined;
    return signInActions(authApiFor(config), next, go ?? ((url) => window.location.assign(url)));
  }, [configProp, next, go]);
  return <SignIn key={initial} initial={initial} actions={actions} />;
}
