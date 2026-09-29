import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LEADS } from "./data";
import { SegmentTable } from "./SegmentTable";

describe("SegmentTable", () => {
  it("is a well-formed ARIA table: every row owns only column headers or cells", () => {
    render(<SegmentTable selected={new Set()} limit={3} />);
    const table = screen.getByRole("table", { name: /^Segment:/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    const [head, ...body] = rows;
    expect(within(head).getAllByRole("columnheader").map((h) => h.textContent || h.getAttribute("aria-label")))
      .toEqual(["Select", "Company", "Decision-maker", "Fit · ColdTrace", "Email", "Reply", "Last touch"]);
    for (const r of rows) for (const c of Array.from(r.children)) expect(["columnheader", "cell"]).toContain(c.getAttribute("role"));
    for (const r of body) expect(within(r).getAllByRole("cell")).toHaveLength(7);
    expect(within(body[0]).getAllByRole("cell")[1]).toHaveTextContent(LEADS[0].company);
  });

  it("toggles a row from its checkbox cell", async () => {
    const onToggle = vi.fn();
    render(<SegmentTable selected={new Set([LEADS[0].id])} onToggle={onToggle} limit={2} />);
    await userEvent.click(screen.getByRole("checkbox", { name: `Select ${LEADS[1].company}` }));
    expect(onToggle).toHaveBeenCalledWith(LEADS[1].id);
  });
});
