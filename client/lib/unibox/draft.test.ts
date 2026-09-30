import { describe, expect, it } from "vitest";
import { UNDO_SECONDS, canSend, changedSentences, checksOf, marks, neverSayHits, paragraphs, priceIssue, stripMarks } from "./draft";

describe("draft checks", () => {
  it("catches the Never-say rules", () => {
    expect(neverSayHits("Is ColdTrace FDA approved?")).toHaveLength(1);
    expect(neverSayHits("We can install tomorrow, same-day installation guaranteed")).toHaveLength(1);
    expect(neverSayHits("The FDA doesn’t approve temperature sensors.")).toHaveLength(0);
  });
  it("flags a price while the knowledge base has two", () => {
    expect(priceIssue("At $35 a sensor a month")).toMatch(/^\$35 a month: the knowledge base has two prices \(\$35 and \$39\)/);
    expect(priceIssue("No price here")).toBeUndefined();
  });
  it("blocks empty and Never-say text; a price only warns", () => {
    expect(checksOf("")).toEqual([{ kind: "empty", text: "The reply is empty.", blocks: true }]);
    expect(checksOf("It is FDA approved.")[0]).toMatchObject({ kind: "never-say", blocks: true });
    expect(checksOf("$39 a month")[0]).toMatchObject({ kind: "price", blocks: false });
    expect(canSend("$39 a month")).toBe(true);
    expect(canSend("FDA approval pending")).toBe(false);
    expect(checksOf("Fine.")).toEqual([]);
  });
  it("splits paragraphs and cite markers, strips them for sending", () => {
    expect(paragraphs("a\n\n\nb\n\n ")).toEqual(["a", "b"]);
    expect(marks("One.[1] Two.[2]")).toEqual(["One.", 1, " Two.", 2]);
    expect(marks("None")).toEqual(["None"]);
    expect(stripMarks("One.[1] Two. [2]")).toBe("One. Two.");
  });
  it("counts changed sentences", () => {
    expect(changedSentences("A one. B two.[1]", "A one. B two.")).toBe(0);
    expect(changedSentences("A one. B two.", "A one. C three. D four.")).toBe(2);
    expect(changedSentences("A one. B two.", "")).toBe(2);
    expect(UNDO_SECONDS).toBe(10);
  });
});
