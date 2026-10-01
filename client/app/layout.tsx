import type { Metadata } from "next";
import { Inter, Inter_Tight, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/marketing/site";

/* Fonts (M10c, PR #72 findings). Every face is one variable file on the latin subset: a variable font carries all
   the weights we use (400–700) in one request, so there are no weights to trim, and static weights would add files.
   Newsreader is Fenceline's alone and loads only on /fenceline (app/fenceline/page.tsx), so / and every other route
   preload three files instead of five.

   The swap: `display: "swap"` shows text at once in a local fallback, and `adjustFontFallback` gives that fallback
   Inter's metrics (size-adjust, ascent/descent/line-gap overrides on a local Arial), so lines keep their length and
   height when the webfont lands. (Don't add `fallback` to those three: with Turbopack an explicit list replaces the
   metric-adjusted face.) Geist Mono falls back to a system mono instead: a mono-to-mono swap keeps every column
   where it is, which an Arial stand-in (the default for it) doesn't. */

// App UI face (Open Range language, used everywhere product UI appears)
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap", adjustFontFallback: true });
// Open Range marketing display face (/, the shared pages, sign-in, the styleguide)
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], display: "swap", adjustFontFallback: true });
// Domains, IDs, key hints
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap", adjustFontFallback: false, fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"] });

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
  openGraph: {
    siteName: "Corral",
    type: "website",
    locale: "en",
    images: [{
      url: "/assets/corral-og.png",
      width: 1200,
      height: 630,
      alt: "Corral. Leads, Tailored. Client acquisition, for the agentic era.",
      type: "image/png",
    }],
  },
  twitter: {
    card: "summary_large_image",
    images: [{
      url: "/assets/corral-og.png",
      width: 1200,
      height: 630,
      alt: "Corral. Leads, Tailored. Client acquisition, for the agentic era.",
    }],
  },
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
