import { SessionProvider } from "@/components/session/SessionProvider";

/**
 * Every screen under /app is its own page. This layout is the session around them:
 * proxy.ts checks the cookie, SessionProvider confirms who is signed in, and the page
 * renders that screen. A new account stays empty; sample rows are only for review builds.
 */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return <SessionProvider>{children}</SessionProvider>;
}
