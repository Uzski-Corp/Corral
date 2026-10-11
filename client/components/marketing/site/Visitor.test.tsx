import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteNav, SiteFooter } from "./Chrome";
import { AuthLink, FencelineNavAccount, VisitorAvatar } from "./Visitor";
import { forgetVisitor, rememberVisitor, SAMPLE_VISITORS } from "@/lib/marketing/visitor";

afterEach(() => forgetVisitor());

describe("marketing nav, signed in or out (M10c)", () => {
  it("signed out: Sign in and Start, as before", () => {
    render(<SiteNav visitor={null} />);
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Start with one product" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByRole("link", { name: "Open app" })).toBeNull();
  });
  it("signed in: the picture, labelled, and Open app to /app, in the bar and the menu; no Sign in", () => {
    render(<SiteNav visitor={SAMPLE_VISITORS["signed-in"]} />);
    expect(screen.getByRole("img", { name: "Signed in as Tomás Ibarra" })).toHaveAttribute("src", "/corral/app/av-tomas.jpg");
    // The bar's Open app only: the small-screen menu drops its Sign in instead of repeating it.
    expect(screen.getByRole("link", { name: "Open app" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("navigation", { name: "Main, small screens" }).querySelectorAll("li")).toHaveLength(4);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Start with one product" })).toBeNull();
  });
  it("no picture, or one that fails: initials", () => {
    const { unmount } = render(<VisitorAvatar visitor={SAMPLE_VISITORS["signed-in-initials"]} />);
    expect(screen.getByRole("img", { name: "Signed in as Amani Odhiambo" })).toHaveTextContent("AO");
    unmount();
    render(<VisitorAvatar visitor={{ name: "Wanjiru Mwangi", avatarUrl: "/nope.jpg" }} size={32} tone="photo" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img", { name: "Signed in as Wanjiru Mwangi" })).toHaveTextContent("WM");
  });
  it("reads the hint cookie on a page (no pin)", () => {
    rememberVisitor({ name: "Grace Wambui", avatarUrl: null });
    render(<><FencelineNavAccount /><AuthLink hideSignedIn /><SiteFooter /></>);
    expect(screen.getAllByRole("img", { name: "Signed in as Grace Wambui" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Open app" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
  it("without the hint, each landing keeps its signed-out nav", () => {
    render(<><FencelineNavAccount /><AuthLink hideSignedIn /></>);
    expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(1);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
