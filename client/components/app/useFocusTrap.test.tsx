import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { Dialog } from "./Overlays";
import { focusableIn, useFocusTrap } from "./useFocusTrap";

function DialogHost({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <button type="button">Outside</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Enroll" footer={<><button type="button">Cancel</button><button type="button">Enroll 3</button></>}>
        <input aria-label="Name" />
      </Dialog>
    </>
  );
}

describe("Dialog focus trap", () => {
  it("keeps Tab and Shift+Tab inside the modal dialog", async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Enroll 3" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Enroll 3" })).toHaveFocus();
  });

  it("pulls focus back in when it escapes, and returns it to the opener on close", async () => {
    const user = userEvent.setup();
    render(<DialogHost initiallyOpen={false} />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    screen.getByRole("button", { name: "Outside" }).focus();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });
});

function Bare({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  return <><button type="button">Before</button><div ref={ref} tabIndex={-1} data-testid="root">{children}</div></>;
}

describe("useFocusTrap", () => {
  it("holds focus on the container when nothing inside can take it", async () => {
    const user = userEvent.setup();
    render(<Bare />);
    await user.tab();
    expect(screen.getByTestId("root")).toHaveFocus();
  });

  it("wraps from outside the container on Shift+Tab", async () => {
    const user = userEvent.setup();
    render(<Bare><button type="button">A</button><button type="button">B</button></Bare>);
    screen.getByTestId("root").focus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "B" })).toHaveFocus();
  });

  it("skips hidden and inert controls", () => {
    const { container } = render(<div><button type="button">Yes</button><button type="button" aria-hidden="true">No</button><button type="button" disabled>Off</button><a href="#x">Link</a></div>);
    expect(focusableIn(container).map((e) => e.textContent)).toEqual(["Yes", "Link"]);
  });

  it("ignores other keys", async () => {
    const user = userEvent.setup();
    render(<Bare><button type="button">A</button></Bare>);
    screen.getByRole("button", { name: "A" }).focus();
    await user.keyboard("x");
    expect(screen.getByRole("button", { name: "A" })).toHaveFocus();
  });
});

describe("CommandPalette focus", () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return <><button type="button" onClick={() => setOpen(true)}>Search</button>{open && <CommandPalette open onClose={() => setOpen(false)} commands={[]} recent={[]} entities={[]} />}</>;
  }

  it("traps Tab in the palette and returns focus on close", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: "Search" }));
    const input = screen.getByRole("combobox");
    expect(input).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Search" })).toHaveFocus();
  });
});
