import { localImagePath } from "./image";
import { PRICING_INTENT_PATH, handlePricingIntent, type PricingEnv } from "./pricing-intent";
import { WAITLIST_PATH, handleWaitlist, type WaitlistEnv } from "./waitlist";

export interface Env extends WaitlistEnv, PricingEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === WAITLIST_PATH) return handleWaitlist(request, env);
    if (pathname === PRICING_INTENT_PATH) return handlePricingIntent(request, env, ctx);
    const path = localImagePath(request);
    if (!path) return env.ASSETS.fetch(request);
    const assetUrl = new URL(path, request.url);
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
} satisfies ExportedHandler<Env>;
