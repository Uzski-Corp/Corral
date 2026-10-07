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
