import { afterEach, describe, expect, it, vi } from "vitest";
import { pricingGateOn } from "./flags";

afterEach(() => vi.unstubAllEnvs());

describe("pricingGateOn", () => {
  it("is off by default", () => {
    vi.stubEnv("NEXT_PUBLIC_PRICING_GATE", "");
    expect(pricingGateOn()).toBe(false);
  });
  it("is on only for exactly 1", () => {
    vi.stubEnv("NEXT_PUBLIC_PRICING_GATE", "1");
    expect(pricingGateOn()).toBe(true);
    for (const v of ["0", "true", "on", " 1"]) { vi.stubEnv("NEXT_PUBLIC_PRICING_GATE", v); expect(pricingGateOn()).toBe(false); }
  });
});
