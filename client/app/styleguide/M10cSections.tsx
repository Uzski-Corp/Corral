"use client";
/* /styleguide: M10c, the signed-in visitor on a marketing page. The shared nav inline (pinned visitor), the account
   slot's three faces, and the two landings' navs framed at 1440 and 390 on their own ?state=signed-in. */
import type { ReactNode } from "react";
import "@/components/marketing/site/styles";
import { SiteNav } from "@/components/marketing/site/Chrome";
import { VisitorAvatar } from "@/components/marketing/site/Visitor";
import { SAMPLE_VISITORS } from "@/lib/marketing/visitor";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;

function Frame({ src, w, h, title }: { src: string; w: 1440 | 390; h: number; title: string }) {
  const scale = w === 1440 ? 0.5 : 1;
  return (
    <div className="sg-m10c-frame" style={{ width: w * scale, height: h * scale }}>
      <iframe src={src} title={title} loading="lazy" tabIndex={-1} aria-hidden="true" width={w} height={h} style={{ transform: `scale(${scale})` }} />
    </div>
  );
}

export function VisitorNavDemo() {
  return (
    <div className="sg-m10c">
      <div className="sg-card"><Label>shared pages · signed out (server HTML, and everyone before hydration)</Label>
        <div className="theme-open-range sn sg-m10c-nav"><SiteNav visitor={null} /></div>
        <Label>signed in · picture, then Open app</Label>
        <div className="theme-open-range sn sg-m10c-nav"><SiteNav visitor={SAMPLE_VISITORS["signed-in"]} /></div>
        <Label>signed in · no picture: initials on the neutral tint</Label>
        <div className="theme-open-range sn sg-m10c-nav"><SiteNav visitor={SAMPLE_VISITORS["signed-in-initials"]} /></div>
      </div>
      <div className="sg-card"><Label>the account slot · picture · initials · picture that failed to load (falls back to initials)</Label>
        <div className="sg-m10c-faces">
          <VisitorAvatar visitor={SAMPLE_VISITORS["signed-in"]} />
          <VisitorAvatar visitor={SAMPLE_VISITORS["signed-in-initials"]} />
          <VisitorAvatar visitor={{ name: "Wanjiru Mwangi", avatarUrl: "/corral/app/av-missing.jpg" }} />
          <span className="sg-m10c-photo"><VisitorAvatar visitor={SAMPLE_VISITORS["signed-in"]} tone="photo" /></span>
        </div>
        <ul className="sg-anatomy">
          <li>Labelled once: <code>Signed in as Tomás Ibarra</code> on the picture; <b>Open app</b> is the one action and goes to <code>/app</code>.</li>
          <li>Each nav keeps its own primary: blue on the shared pages, ink over the Open Range photo, the Fenceline ink button.</li>
          <li>No redirect and no layout change: the slot is right-aligned in a fixed-height bar, so the swap after hydration moves nothing.</li>
          <li>Small screens: Sign in was hidden; signed in, the picture and a compact Open app stay in the bar, and the menu drops its Sign in.</li>
        </ul>
      </div>
      <div className="sg-card"><Label>/ · 1440 · signed out, then signed in</Label>
        <Frame src="/?state=signed-out" w={1440} h={120} title="Open Range nav, signed out" />
        <Frame src="/?state=signed-in" w={1440} h={120} title="Open Range nav, signed in" />
        <Label>/fenceline · 1440 · signed in</Label>
        <Frame src="/fenceline?state=signed-in" w={1440} h={120} title="Fenceline nav, signed in" />
      </div>
      <div className="sg-card"><Label>390 · / · /pricing · /fenceline, signed in</Label>
        <div className="sg-m10c-phones">
          <Frame src="/?state=signed-in" w={390} h={96} title="Open Range nav at 390, signed in" />
          <Frame src="/pricing?state=signed-in-initials" w={390} h={96} title="Shared nav at 390, signed in with initials" />
          <Frame src="/fenceline?state=signed-in" w={390} h={96} title="Fenceline nav at 390, signed in" />
        </div>
      </div>
    </div>
  );
}
