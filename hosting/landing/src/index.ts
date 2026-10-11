import { localImagePath } from "./image";
import { WAITLIST_PATH, handleWaitlist, type WaitlistEnv } from "./waitlist";

export interface Env extends WaitlistEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (new URL(request.url).pathname === WAITLIST_PATH) return handleWaitlist(request, env, ctx);
    const path = localImagePath(request);
    if (!path) return env.ASSETS.fetch(request);
    const assetUrl = new URL(path, request.url);
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
} satisfies ExportedHandler<Env>;
