import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      // Coverage gate for the code this change adds. Bau's design components are exercised by
      // the component tests too, but are reported separately (pnpm test:coverage:all).
      include: [
        "lib/**/*.{ts,tsx}",
        "proxy.ts",
        "components/session/**/*.tsx",
        "components/app/useFocusTrap.ts",
        "components/app/kb/live.ts",
        "app/app/layout.tsx",
        "app/onboarding/layout.tsx",
        "app/sign-in/page.tsx",
        "app/onboarding/page.tsx",
        "app/app/**/page.tsx",
      ],
      reporter: ["text", "text-summary", "json-summary", "html"],
      thresholds: { lines: 99, statements: 98, functions: 98, branches: 96 },
    },
  },
});
