import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Onboarding, type OnboardingLive } from "./Onboarding";

const live = (over: Partial<OnboardingLive> = {}): OnboardingLive => ({
  seed: {
    name: "Northwind", slug: "northwind", tz: "nbo", team: "small", product: "Sensors", pitch: "Pages the person on duty.",
    site: "northwind.io", logoUrl: null, pages: [], highlights: [], invites: [],
  },
  onLogo: vi.fn(async () => ({ url: "https://assets.test/logo.png" })),
  onReadSite: vi.fn(async () => ({
    pages: [{ path: "/", title: "Northwind Sensors" }, { path: "/pricing", title: "Pricing" }],
    highlights: ["Page the right person"],
  })),
  onSave: vi.fn(async () => null),
  ...over,
});

describe("live onboarding", () => {
  it("shows the pages and headings the site read returned", async () => {
    render(<Onboarding initialStep={3} initialDone={[1, 2]} live={live()} />);
    await userEvent.click(screen.getByRole("button", { name: "Read my site" }));
    expect(await screen.findByText("Northwind Sensors")).toBeInTheDocument();
    expect(screen.getByText("Page the right person")).toBeInTheDocument();
    expect(screen.getByText("Read /pricing")).toBeInTheDocument();
    expect(screen.queryByText("Spoilage from doors left open")).not.toBeInTheDocument();
  });

  it("shows the reader's error instead of sample pages", async () => {
    render(<Onboarding initialStep={3} initialDone={[1, 2]} live={live({ onReadSite: vi.fn(async () => ({ error: "The page returned 404." })) })} />);
    await userEvent.click(screen.getByRole("button", { name: "Read my site" }));
    expect(await screen.findByText("The page returned 404.")).toBeInTheDocument();
    expect(screen.queryByText(/of ~38 pages/)).not.toBeInTheDocument();
  });
});
