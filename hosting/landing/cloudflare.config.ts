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
			],
		},
		domains: [
			"corral.uzskicorp.agency",
		],
		env: {
			ASSETS: bindings.assets(),
		},
	},
});
