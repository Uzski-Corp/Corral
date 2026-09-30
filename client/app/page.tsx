import Image from "next/image";
import Link from "next/link";
import { FitBar } from "@/components/app/primitives";
import { Mark } from "@/components/app/icons";

const ROUTES = [
  { href: "/open-range", name: "Open Range", idea: "Your whole market as one clear field. Daylight open land, a white quiet product floating over it.", img: "/corral/or/range-wide.jpg", fit: 94 },
  { href: "/fenceline", name: "Fenceline", idea: "Gather the few who fit. Engraved open land in ink on paper; the same product, framed like a book plate.", img: "/corral/en/land-plate.jpg", fit: 91 },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-surface-muted px-5 py-10 text-text sm:px-10">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex items-center gap-2.5 text-[15px] font-medium"><Mark size={18} />Corral<span className="font-normal text-text-quaternary">Round 3 · two landings, one product language</span></div>
        <h1 className="mt-20 max-w-[16ch] font-[family-name:var(--font-inter-tight)] text-[clamp(38px,5vw,60px)] font-medium leading-[1.02] tracking-[-0.035em]">Two ways to tell the same story.</h1>
        <p className="mt-5 max-w-[46em] text-[15px] leading-6 text-text-secondary">Both landings embed the same live Open Range app components. The app language is fixed; only the marketing layer changes.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {ROUTES.map((r) => (
            <Link key={r.href} href={r.href} className="group block overflow-hidden rounded-window bg-canvas shadow-[0_0_0_1px_var(--color-border)] transition-shadow hover:shadow-pop">
              <div className="relative aspect-[16/9] overflow-hidden"><Image src={r.img} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" /></div>
              <div className="flex items-start justify-between gap-6 p-5">
                <div><div className="text-title font-medium">{r.name}</div><p className="mt-1 text-content text-text-secondary">{r.idea}</p></div>
                <span className="c-app shrink-0 pt-1"><FitBar value={r.fit} /></span>
              </div>
            </Link>
          ))}
        </div>
        <Link href="/styleguide" className="mt-6 flex items-center justify-between rounded-window bg-canvas p-5 shadow-[0_0_0_1px_var(--color-border)] hover:shadow-pop">
          <div><div className="text-title font-medium">App language, in use</div><p className="mt-1 text-content text-text-secondary">Fit bar, status tags, segment table, row detail, unibox, reply card, nav, buttons, filters and inputs.</p></div>
          <span className="c-btn c-btn--primary c-btn--lg">Open /styleguide</span>
        </Link>
        <p className="mt-10 text-meta text-text-quaternary">Sample content. People, companies and numbers are illustrative. Photography from Unsplash and Pexels, reference only.</p>
      </div>
    </main>
  );
}
