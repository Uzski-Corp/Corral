import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { INDUSTRIES } from "@/lib/marketing/pricingIntent";
import { IndustryCombobox, filterIndustries } from "./IndustryCombobox";

function setup(props: Partial<React.ComponentProps<typeof IndustryCombobox>> = {}) {
  const onChange = vi.fn();
  const ui = render(<><label htmlFor="ind">Industry</label><IndustryCombobox id="ind" value="" onChange={onChange} {...props} /><button>after</button></>);
  const trigger = screen.getByRole("combobox", { name: "Industry" });
  return { onChange, trigger, user: userEvent.setup(), ...ui };
}

describe("filterIndustries", () => {
  it("returns all 16 for an empty or blank query", () => {
    expect(filterIndustries("")).toHaveLength(16);
    expect(filterIndustries("   ")).toHaveLength(16);
  });
  it("matches on the label, case-insensitively and anywhere in it", () => {
    expect(filterIndustries("re").map((i) => i.label)).toEqual(["Agriculture and food", "Retail and e-commerce", "Software and IT", "Healthcare", "Construction and real estate"]);
    expect(filterIndustries("TELE").map((i) => i.value)).toEqual(["telecoms"]);
    expect(filterIndustries("zzz")).toEqual([]);
  });
});

describe("IndustryCombobox", () => {
  it("is a closed combobox showing the placeholder, wired to its listbox", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveTextContent("Search or choose");
    expect(trigger).toHaveClass("is-placeholder");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("shows the chosen label and ticks it in the list", async () => {
    const { trigger, user } = setup({ value: "healthcare" });
    expect(trigger).toHaveTextContent("Healthcare");
    expect(trigger).not.toHaveClass("is-placeholder");
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "Healthcare" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Education" })).toHaveAttribute("aria-selected", "false");
  });
  it("opens on click with 16 options, focus in the search box, and closes on a second click", async () => {
    const { trigger, user } = setup();
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("listbox", { name: "Industry" })).getAllByRole("option")).toHaveLength(INDUSTRIES.length);
    expect(screen.getByRole("searchbox", { name: "Search industries" })).toHaveFocus();
    await user.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("filters as you type and names the highlighted option for assistive tech", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    const search = screen.getByRole("searchbox");
    await user.type(search, "re");
    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(search).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0]!.id);
  });
  it("says there is no match, with an empty listbox", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("No match");
    expect(screen.getByRole("searchbox")).not.toHaveAttribute("aria-activedescendant");
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });
  it("arrows wrap around, Enter picks, and the trigger gets focus back", async () => {
    const { user, trigger, onChange } = setup();
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getAllByRole("option")[2]).toHaveClass("is-hover");
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}"); // 2 -> 1 -> 0 -> wraps to 15
    expect(screen.getAllByRole("option")[15]).toHaveClass("is-hover");
    await user.keyboard("{ArrowDown}{Enter}"); // wraps to 0
    expect(onChange).toHaveBeenCalledWith("agriculture-food");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger).toHaveFocus();
  });
  it("picks with a click and from a filtered list", async () => {
    const { user, trigger, onChange } = setup();
    await user.click(trigger);
    await user.type(screen.getByRole("searchbox"), "tele");
    await user.click(screen.getByRole("option", { name: "Telecoms" }));
    expect(onChange).toHaveBeenCalledWith("telecoms");
    await user.click(trigger);
    expect(screen.getByRole("searchbox")).toHaveValue(""); // the query resets
  });
  it("opens with the current choice highlighted", async () => {
    const { user, trigger } = setup({ value: "education" });
    await user.click(trigger);
    expect(screen.getAllByRole("option")[9]).toHaveClass("is-hover");
  });
  it("opens from the closed trigger with ArrowDown or ArrowUp, and ignores them when already open", async () => {
    const { user, trigger } = setup();
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    trigger.focus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
  it("type-ahead: typing on the closed trigger opens it with that text", async () => {
    const { user, trigger } = setup();
    trigger.focus();
    await user.keyboard("t");
    expect(screen.getByRole("searchbox")).toHaveValue("t");
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });
  it("ignores modifier chords, space and other keys on the closed trigger", () => {
    const { trigger } = setup();
    for (const init of [{ key: "a", ctrlKey: true }, { key: "a", metaKey: true }, { key: "a", altKey: true }, { key: " " }, { key: "Tab" }, { key: "Enter" }]) {
      fireEvent.keyDown(trigger, init);
    }
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("Escape closes the menu, stops there, and returns to the trigger", async () => {
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{Escape}");
    document.removeEventListener("keydown", outer);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(outer).not.toHaveBeenCalled(); // the dialog's own Escape never sees it
  });
  it("Tab closes the menu and an outside click closes it too", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "after" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(trigger);
    await user.click(screen.getByRole("searchbox")); // inside: stays open
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
  it("does not open when disabled (a request is being sent)", async () => {
    const { user, trigger } = setup({ disabled: true });
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    await user.click(trigger);
    trigger.focus();
    await user.keyboard("{ArrowDown}t");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("reports invalid state and its description", () => {
    const { trigger } = setup({ invalid: true, describedBy: "msg" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAttribute("aria-describedby", "msg");
    expect(trigger).toHaveClass("is-error");
  });
});
