import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState, ErrorState } from "./States";

describe("EmptyState / ErrorState body", () => {
  it("keeps text in a <p>", () => {
    const { container } = render(<EmptyState title="Nothing yet">Import a CSV to start.</EmptyState>);
    expect(container.querySelector(".c-empty__txt > p:not(.c-strong)")).toHaveTextContent("Import a CSV to start.");
    expect(container.querySelector(".c-empty__more")).toBeNull();
  });

  it.each([["EmptyState", EmptyState], ["ErrorState", ErrorState]] as const)("%s puts a list in a div, never inside a <p> (valid HTML, no hydration mismatch)", (_n, C) => {
    const { container } = render(<C title="No companies matched"><ul><li>Loosen the size</li></ul></C>);
    expect(container.querySelector("p ul")).toBeNull();
    expect(container.querySelector(".c-empty__txt > .c-empty__more > ul")).toHaveTextContent("Loosen the size");
  });
});
