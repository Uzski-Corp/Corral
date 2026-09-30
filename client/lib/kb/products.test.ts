import { describe, expect, it } from "vitest";
import { productRows } from "./products";

const ps = [{ id: "a", name: "ColdTrace Sensors" }, { id: "b", name: "ColdTrace Gateway" }];
describe("productRows (M11)", () => {
  it("shows a count only where it's known, and never a guessed 0", () => {
    expect(productRows(ps, "a", { a: 12 })).toEqual([
      { id: "a", label: "ColdTrace Sensors", checked: true, meta: "12 sources" },
      { id: "b", label: "ColdTrace Gateway", checked: false },
    ]);
    expect(productRows(ps, "b", { a: 1, b: 0 }).map((r) => r.meta)).toEqual(["1 source", "0 sources"]);
    expect(productRows(ps, null)).toEqual([{ id: "a", label: "ColdTrace Sensors", checked: false }, { id: "b", label: "ColdTrace Gateway", checked: false }]);
  });
});
