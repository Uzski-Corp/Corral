import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SITE_URL } from "@/lib/marketing/site";
import { SHARE_IMAGE, THEME, twitterFor } from "@/lib/marketing/seo";

/* Committed variable fonts keep dev and production builds independent of Google.
   next/font still emits hashed assets, preloads, and metric-adjusted fallbacks.
   Newsreader stays scoped to /fenceline, so other routes preload only three files. */

// App UI face (Open Range language, used everywhere product UI appears)
const inter = localFont({ src: "./fonts/inter-latin-variable.woff2", weight: "100 900", style: "normal", variable: "--font-inter", display: "swap", adjustFontFallback: "Arial" });
// Open Range marketing display face (/, the shared pages, sign-in, the styleguide)
const interTight = localFont({ src: "./fonts/inter-tight-latin-variable.woff2", weight: "100 900", style: "normal", variable: "--font-inter-tight", display: "swap", adjustFontFallback: "Arial" });
// Domains, IDs, key hints
const geistMono = localFont({ src: "./fonts/geist-mono-latin-variable.woff2", weight: "100 900", style: "normal", variable: "--font-geist-mono", display: "swap", adjustFontFallback: false, fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Corral", template: "%s · Corral" },
  description: "Corral reads your market against what you sell and puts a real person at the end of every row.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
  // Each public page replaces this with openGraphFor(its route), which adds og:url (lib/marketing/seo.ts).
  openGraph: { siteName: "Corral", type: "website", locale: "en", images: [{ ...SHARE_IMAGE, type: "image/png" }] },
  twitter: twitterFor(),
};

/** theme-color per colour scheme (lib/marketing/seo.ts THEME has the reasoning). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME.light },
    { media: "(prefers-color-scheme: dark)", color: THEME.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
