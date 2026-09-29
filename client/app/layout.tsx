import type { Metadata } from "next";
import { Inter, Inter_Tight, Newsreader, Geist_Mono } from "next/font/google";
import "./globals.css";

// App UI face (Open Range language, used everywhere product UI appears)
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// Open Range marketing display face
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
// Fenceline marketing serif (optical sizes + italic for captions)
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});
// Domains, IDs, key hints
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Corral",
  description: "Corral reads your market against what you sell and puts a real person at the end of every row.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} ${newsreader.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
