interface Env {
  ASSETS: Fetcher;
}

/** Next/Image URLs from the static build. The file itself already lives in the asset bundle. */
function localImagePath(request: Request): string | null {
  const url = new URL(request.url);
  if (url.pathname !== "/_next/image") return null;
  const raw = url.searchParams.get("url");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("..")) return null;
  return raw;
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = localImagePath(request);
    if (!path) return env.ASSETS.fetch(request);
    const assetUrl = new URL(path, request.url);
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
} satisfies ExportedHandler<Env>;
