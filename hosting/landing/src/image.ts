/** Next/Image URLs from the static build. The file itself already lives in the asset bundle. */
export function localImagePath(request: Request): string | null {
  const url = new URL(request.url);
  if (url.pathname !== "/_next/image") return null;
  const raw = url.searchParams.get("url");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("..")) return null;
  return raw;
}
