import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./msw";
import { router } from "./router";

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// next/image needs the Next image loader; a plain <img> is enough for component tests.
vi.mock("next/image", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  default: ({ fill, priority, sizes, ...rest }: Record<string, unknown>) => createElement("img", rest),
}));

// jsdom has no layout, so no scrollIntoView (the ⌘K list keeps its active row in view with it).
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
  if (typeof document !== "undefined") document.cookie.split(";").forEach((c) => { const n = c.split("=")[0].trim(); if (n) document.cookie = `${n}=; Max-Age=0; Path=/`; });
});
afterAll(() => server.close());
