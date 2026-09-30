import { describe, expect, it } from "vitest";
import { cleanPassage, passageLabel, plainPassage } from "./passages";

describe("passage labels and text (M11)", () => {
  it("keeps a short locator in the column, turns a heading into a heading label, and numbers a missing one", () => {
    expect(passageLabel("p. 14", 3)).toEqual({ kind: "short", text: "p. 14" });
    expect(passageLabel("§2", 1)).toEqual({ kind: "short", text: "§2" });
    expect(passageLabel("ColdTrace T4 wireless temperature sensors", 0)).toEqual({ kind: "heading", text: "ColdTrace T4 wireless temperature sensors" });
    expect(passageLabel("## Who buys it", 0)).toEqual({ kind: "heading", text: "Who buys it" });
    expect(passageLabel(null, 4)).toEqual({ kind: "short", text: "§5" });
    expect(passageLabel("   ", 0)).toEqual({ kind: "short", text: "§1" });
  });
  it("strips markdown: headings become blocks, a leading heading equal to the label goes, lists and emphasis are plain", () => {
    const md = "# ColdTrace T4 wireless temperature sensors\nThe T4 reads every **30 seconds**.\nIt runs on _two_ AA cells.\n\n## Who buys it - Dairies\n- Cold rooms\n2. Reefer trucks\nSee [pricing](https://x.io) and `T4-PRO`. ## trailing ##";
    expect(cleanPassage(md, "ColdTrace T4 wireless temperature sensors")).toEqual([
      { p: "The T4 reads every 30 seconds. It runs on two AA cells." },
      { h: "Who buys it - Dairies", level: 2 },
      { p: "• Cold rooms" }, { p: "• Reefer trucks" },
      { p: "See pricing and T4-PRO. ## trailing ##" },
    ]);
    expect(cleanPassage("# Title ##\nBody", "Other")).toEqual([{ h: "Title", level: 1 }, { p: "Body" }]);
    expect(cleanPassage("Plain text only.")).toEqual([{ p: "Plain text only." }]);
    expect(plainPassage("## Heading\nBody text")).toBe("Heading. Body text");
  });
});
