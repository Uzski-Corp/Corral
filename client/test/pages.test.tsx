import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigCache } from "@/lib/config";
import SignInPage from "@/app/sign-in/page";
import OnboardingPage from "@/app/onboarding/page";
import AppPage from "@/app/app/page";
import AppLayout from "@/app/app/layout";
import OnboardingLayout from "@/app/onboarding/layout";

const params = (q: Record<string, string | string[]>) => ({ params: Promise.resolve({}), searchParams: Promise.resolve(q) });

afterEach(() => { vi.unstubAllEnvs(); resetConfigCache(); });

describe("/sign-in page", () => {
  it("shows the failure screen for a callback error", async () => {
    render(await SignInPage(params({ error: "auth_failed" }) as never));
    expect(screen.getByText("That sign-in didn’t finish")).toBeInTheDocument();
  });

  it("honours review states outside production", async () => {
    render(await SignInPage(params({ state: ["invalid"] }) as never));
    expect(screen.getByRole("textbox", { name: "Work email" })).toHaveAttribute("aria-invalid", "true");
  });

  it("ignores review states in a production live build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.corral.test");
    resetConfigCache();
    render(await SignInPage(params({ state: "sent" }) as never));
    expect(screen.queryByRole("heading", { name: "Check your email" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Sign in to Corral" })).toBeInTheDocument();
  });
});

describe("/onboarding and /app pages keep their review params", () => {
  it("renders the requested onboarding step", async () => {
    render(await OnboardingPage(params({ step: "3", skipped: "4", crawl: "done" }) as never));
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
  });

  it("renders the requested app view inside the session layout", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await AppPage(params({ view: "companies", collapsed: "1" }) as never);
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Companies")).toBeInTheDocument();
  });

  it("opens a knowledge base review state", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await AppPage(params({ view: ["knowledge"], state: "empty" }) as never);
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByRole("heading", { name: "Teach Corral what you sell" })).toBeInTheDocument();
  });

  it("opens a leads review state (M3)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await AppPage(params({ view: "companies", state: "empty" }) as never);
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByRole("heading", { name: "Bring in the companies you already know" })).toBeInTheDocument();
  });

  it("opens a discovery review state (M4)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await AppPage(params({ view: "discovery", state: "empty" }) as never);
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByText("Find companies that fit ColdTrace Sensors")).toBeInTheDocument();
  });

  it("opens a sequences review state (M6)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await AppPage(params({ view: "sequences", state: "empty" }) as never);
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByText("Write your first sequence")).toBeInTheDocument();
  });

  it("wraps onboarding in the session layout", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await OnboardingPage(params({}) as never);
    render(OnboardingLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
  });
});
