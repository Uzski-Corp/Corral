import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GateRow } from "./Steps";
import { CONDITION_HINT, NOT_OPENED_NOTE, OPENS_NOTE } from "@/lib/sequences/sequence";

/* M7 follow-up to M6 (HANDOFF §14 decision 12): "Opened, no reply" says opens are a guess, and is never the default. */
describe("condition menu · open-tracking hints (M7 + M8)", () => {
  it("puts the hint under 'Opened, no reply' only; No reply stays the default", async () => {
    render(<GateRow gate={{ wait: 3, cond: "no-reply" }} editable n={2} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Send step 2: No reply" }));
    const box = screen.getByRole("listbox");
    expect(within(box).getByRole("option", { name: /No reply.*default/ })).toHaveAttribute("aria-selected", "true");
    expect(within(box).getByRole("option", { name: /Opened, no reply/ })).toHaveTextContent(OPENS_NOTE);
    expect(within(box).getByRole("option", { name: /Not opened/ })).toHaveTextContent(NOT_OPENED_NOTE);
    expect(CONDITION_HINT["no-reply"]).toBeUndefined();
    expect(OPENS_NOTE).toBe("Opens are a guess. Apple Mail and some others open every email automatically, so this may fire for people who never read it.");
  });
  it("M8: 'Not opened' gets its own hint, and its note under the gate", () => {
    expect(NOT_OPENED_NOTE).toBe("Opens are a guess, so some people who read it may still count as not opened.");
    render(<GateRow gate={{ wait: 4, cond: "not-opened", otherwise: "stop" }} editable n={2} onChange={() => {}} />);
    expect(screen.getByText(NOT_OPENED_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(OPENS_NOTE)).not.toBeInTheDocument();
  });
  it("keeps the note under the gate once it's picked", () => {
    render(<GateRow gate={{ wait: 5, cond: "opened-no-reply", otherwise: "stop" }} editable n={3} onChange={() => {}} />);
    expect(screen.getByText(OPENS_NOTE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send step 3: Opened, no reply" })).toBeInTheDocument();
  });
});
