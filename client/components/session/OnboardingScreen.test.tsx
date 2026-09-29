import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { router } from "@/test/router";
import { OnboardingScreen } from "./OnboardingScreen";

describe("OnboardingScreen", () => {
  it("marks this browser onboarded on Save and exit", async () => {
    render(<OnboardingScreen initialStep={1} />);
    await userEvent.click(screen.getByRole("button", { name: "Save and exit" }));
    expect(document.cookie).toContain("corral_onboarded=1");
    expect(router.push).toHaveBeenCalledWith("/app");
  });

  it("marks this browser onboarded on Open Corral", async () => {
    render(<OnboardingScreen initialStep={6} skipped={[4]} />);
    await userEvent.click(screen.getByRole("button", { name: /Open Corral/ }));
    expect(document.cookie).toContain("corral_onboarded=1");
    expect(router.push).toHaveBeenCalledWith("/app");
  });
});
