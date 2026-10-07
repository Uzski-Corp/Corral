import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingFooter } from "./PricingFooter";

describe("PricingFooter background", () => {
  it("is the vector horizon, filling the band, not the stretched dusk.jpg", () => {
    const { container } = render(<PricingFooter />);
    const bg = container.querySelector("#pricing > img.or-bg") as HTMLImageElement;
    expect(bg).not.toBeNull();
    expect(bg.getAttribute("src")).toBe("/corral/footer-horizon.svg");
    expect(bg).toHaveAttribute("alt", "");
    expect(bg.style.position).toBe("absolute");
    expect(bg.style.width).toBe("100%");
    expect(bg.style.height).toBe("100%");
    expect(container.innerHTML).not.toContain("dusk.jpg");
  });
});
