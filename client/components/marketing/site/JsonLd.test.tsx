import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JsonLd } from "./JsonLd";

describe("JsonLd", () => {
  it("renders one application/ld+json script whose text parses to the data", () => {
    const data = { "@context": "https://schema.org", "@type": "Thing", name: "Corral" };
    const { container } = render(<JsonLd data={data} />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0].textContent!)).toEqual(data);
  });

  it("can't be broken out of by a string in the data", () => {
    const { container } = render(<JsonLd data={{ name: "</script><img src=x onerror=alert(1)>" }} />);
    expect(container.querySelectorAll("script")).toHaveLength(1);
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("</script><img");
  });
});
