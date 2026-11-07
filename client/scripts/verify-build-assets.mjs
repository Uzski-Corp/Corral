import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

// A successful Next compilation can still emit an empty root layout CSS entry.
// Refuse to package that artifact in local builds and in either Docker deployment.
const layout = resolve("app/layout");
for (const route of ["page", "app/page", "sign-in/page"]) {
  const context = { globalThis: {} };
  const manifestPath = `.next/server/app/${route}_client-reference-manifest.js`;
  runInNewContext(readFileSync(manifestPath, "utf8"), context);
  const manifests = Object.values(context.globalThis.__RSC_MANIFEST ?? {});
  const files = manifests.flatMap((manifest) => manifest.entryCSSFiles?.[layout] ?? []);
  const css = files.map((file) => file.inlined
    ? file.content
    : readFileSync(resolve(".next", file.path), "utf8")).join("\n");
  for (const required of ["--color-canvas:", ".c-side", ".u-chip", "@font-face", "--font-inter:", "--font-geist-mono:"]) {
    if (!css.includes(required)) {
      throw new Error(`Incomplete root layout CSS for ${route}: missing ${required}. Check the build directory and CSS manifest before shipping.`);
    }
  }
}
if (!existsSync(".next/standalone/server.js")) {
  throw new Error("Missing standalone server. Build with output: standalone before packaging.");
}
console.log("Production assets: root styles and fonts are linked on home, app, and sign-in.");
