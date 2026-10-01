import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { appPath } from "@/lib/appPath";
import { router } from "@/test/router";
import { AppDemo } from "./AppDemo";

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("side nav routing", () => {
  it("writes the screen into the /app URL", async () => {
    window.history.pushState({}, "", "/app");
    render(<AppDemo hotkeys={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Companies" }));
    expect(router.push).toHaveBeenCalledWith(appPath("companies"), { scroll: false });
    await userEvent.click(screen.getByRole("button", { name: /F&B · East Africa/ }));
    expect(router.push).toHaveBeenCalledWith(appPath("segments", { segment: "F&B · East Africa" }), { scroll: false });
  });

  it("leaves the address alone when the shell is embedded", async () => {
    window.history.pushState({}, "", "/styleguide");
    render(<AppDemo frame="contained" hotkeys={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Companies" }));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Companies" })).toHaveAttribute("aria-current", "page");
  });
});
