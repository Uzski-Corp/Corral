import { SessionProvider } from "@/components/session/SessionProvider";

/** Everything under /app needs a session: proxy.ts checks the cookie, SessionProvider confirms it. */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return <SessionProvider>{children}</SessionProvider>;
}
