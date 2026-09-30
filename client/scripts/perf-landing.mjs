// Landing lab numbers (ENG-87), Bau's M10 profile: Playwright + CDP, 4x CPU, Slow 4G (150 ms RTT, 1.6 Mbps down,
// 750 kbps up), cold cache. "TBT" is Bau's M10 number: sum(longtask - 50 ms) from navigation to load + 3 s, so it
// includes long tasks before first paint; "TBT after FCP" counts only tasks that start after FCP (closer to
// Lighthouse). Each route runs N times per width; medians, because the pre-FCP layout task is bimodal.
//
//   pnpm build && pnpm start -p 3302 &     (or a review build: NEXT_PUBLIC_DESIGN_REVIEW=1)
//   BASE=http://localhost:3302 node scripts/perf-landing.mjs /,/open-range,/pricing 8     (DEBUG=1 lists each run's long tasks)
import { chromium } from "@playwright/test";
const base = process.env.BASE ?? "http://localhost:3302";
const routes = (process.argv[2] ?? "/open-range").split(",");
const N = Number(process.argv[3] ?? 5);
const reduce = process.env.REDUCE === "1";
const b = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log("form | route | runs | FCP | LCP | CLS | TBT (median) | TBT all runs | TBT after FCP (median) | after-FCP all runs | long tasks | hero live at (ms)");
for (const mobile of [true, false]) for (const r of routes) {
  const runs = [];
  for (let i = 0; i < N; i++) {
    const ctx = await b.newContext({ ...(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } }), reducedMotion: reduce ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      window.__m = { lcp: 0, cls: 0, tbt: 0, long: 0, live: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__m.long++; window.__m.tbt += Math.max(0, e.duration - 50); (window.__m.lt ||= []).push([e.startTime, e.duration]); } }).observe({ type: "longtask", buffered: true });
      new MutationObserver(() => { if (!window.__m.live && document.querySelector(".or-hero__plate .pf__app .c-app")) window.__m.live = performance.now(); }).observe(document, { subtree: true, childList: true });
    });
    await page.goto(base + r, { waitUntil: "load", timeout: 180000 });
    await page.waitForTimeout(3000);
    const fcp = await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0);
    const m = await page.evaluate(() => window.__m);
    runs.push({ fcp, ...m, tbtFcp: (m.lt ?? []).filter(([s]) => s >= fcp).reduce((a, [, d]) => a + Math.max(0, d - 50), 0) }); if (process.env.DEBUG) console.log("  run", i, JSON.stringify((m.lt ?? []).map(([s, d]) => [Math.round(s), Math.round(d)])), "live", Math.round(m.live));
    await ctx.close();
  }
  const pick = (k) => Math.round(med(runs.map((x) => x[k])));
  console.log([mobile ? "390" : "1440", r, N, pick("fcp"), pick("lcp"), med(runs.map((x) => x.cls)).toFixed(3), pick("tbt"), runs.map((x) => Math.round(x.tbt)).join("/"), pick("tbtFcp"), runs.map((x) => Math.round(x.tbtFcp)).join("/"), pick("long"), pick("live")].join(" | "));
}
await b.close();
