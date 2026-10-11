import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "corral-landing",
		compatibilityDate: "2026-10-07",
		entrypoint: "src/index.ts",
		workersDev: false,
		assets: {
			htmlHandling: "auto-trailing-slash",
			notFoundHandling: "404-page",
			runWorkerFirst: [
				"/_next/image",
				"/_next/image/*",
				"/api/*",
			],
		},
		domains: [
			"corral.uzskicorp.agency",
		],
		env: {
			ASSETS: bindings.assets(),
			// The waitlist (POST /api/waitlist). Schema: migrations/, applied with `pnpm run db:migrate:remote`.
			WAITLIST_DB: bindings.d1({ id: "217835f7-3973-4120-bde4-5a7d2268c917", name: "corral-waitlist" }),
		},
	},
});
