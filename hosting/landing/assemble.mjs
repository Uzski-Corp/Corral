import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const client = path.resolve(root, "../../client");
const appDir = path.join(client, ".next/server/app");
const dist = path.join(root, "dist");

const pages = [
  ["index.html", "index.html"],
  ["pricing.html", "pricing.html"],
  ["security.html", "security.html"],
  ["mcp.html", "mcp.html"],
  ["changelog.html", "changelog.html"],
  ["fenceline.html", "fenceline.html"],
  ["legal/terms.html", "legal/terms.html"],
  ["legal/privacy.html", "legal/privacy.html"],
  ["legal/dpa.html", "legal/dpa.html"],
  // Landing directions (Bau, Oct 7): static, noindex, picked from at /v/1–/v/4.
  ["v/1.html", "v/1.html"],
  ["v/2.html", "v/2.html"],
  ["v/3.html", "v/3.html"],
  ["v/4.html", "v/4.html"],
  ["_not-found.html", "404.html"],
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(client, "public"), dist, { recursive: true });
await cp(path.join(client, ".next/static"), path.join(dist, "_next/static"), { recursive: true });

for (const [from, to] of pages) {
  const target = path.join(dist, to);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(appDir, from), target);
}

await writeFile(path.join(dist, "robots.txt"), await readFile(path.join(appDir, "robots.txt.body")));
await writeFile(path.join(dist, "sitemap.xml"), await readFile(path.join(appDir, "sitemap.xml.body")));
// The web app manifest (client/app/manifest.ts). Workers assets pick the content type from the extension; _headers
// pins application/manifest+json so it never depends on that mapping.
await writeFile(path.join(dist, "manifest.webmanifest"), await readFile(path.join(appDir, "manifest.webmanifest.body")));
await writeFile(
  path.join(dist, "_headers"),
  ["/manifest.webmanifest", "  Content-Type: application/manifest+json", ""].join("\n"),
);
await writeFile(
  path.join(dist, "_redirects"),
  ["/terms /legal/terms 301", "/privacy /legal/privacy 301", ""].join("\n"),
);

const htmlFiles = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith(".html")) htmlFiles.push(full);
  }
}
await walk(dist);
if (htmlFiles.length < pages.length) {
  throw new Error(`expected at least ${pages.length} html files, found ${htmlFiles.length}`);
}
console.log(`assembled ${htmlFiles.length} html files into ${dist}`);
