import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigCache } from "@/lib/config";
import SignInPage from "@/app/sign-in/page";
import OnboardingPage from "@/app/onboarding/page";
import AppLayout from "@/app/app/layout";
import UniboxPage from "@/app/app/page";
import CompaniesPage from "@/app/app/companies/page";
import DiscoveryPage from "@/app/app/discovery/page";
import SequencesPage from "@/app/app/sequences/page";
import KnowledgePage from "@/app/app/knowledge/page";
import SettingsPage from "@/app/app/settings/page";
import OnboardingLayout from "@/app/onboarding/layout";

const params = (q: Record<string, string | string[]>) => ({ params: Promise.resolve({}), searchParams: Promise.resolve(q) });
const search = (q: Record<string, string | string[]>) => ({ searchParams: Promise.resolve(q) });
const app = (slug: string[] | undefined, q: Record<string, string | string[]> = {}) => {
  const props = search(q);
  if (!slug?.length) return UniboxPage(props);
  if (slug[0] === "companies") return CompaniesPage(props);
  if (slug[0] === "discovery") return DiscoveryPage(props);
  if (slug[0] === "sequences") return SequencesPage(props);
  if (slug[0] === "knowledge") return KnowledgePage(props);
  if (slug[0] === "settings") return SettingsPage(props);
  throw new Error(`unmapped app slug ${slug.join("/")}`);
};

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
    const page = await app(["companies"], { collapsed: "1" });
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Companies")).toBeInTheDocument();
  });

  it("opens a knowledge base review state", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await app(["knowledge"], { state: "empty" });
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByRole("heading", { name: "Teach Corral what you sell" })).toBeInTheDocument();
  });

  it("opens a leads review state (M3)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await app(["companies"], { state: "empty" });
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByRole("heading", { name: "Bring in the companies you already know" })).toBeInTheDocument();
  });

  it("opens a discovery review state (M4)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await app(["discovery"], { state: "empty" });
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByText("Find your market")).toBeInTheDocument();
  });

  it("opens a sequences review state (M6)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await app(["sequences"], { state: "empty" });
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByText("No sequences yet")).toBeInTheDocument();
  });

  it("opens a unibox review state (M7)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await app(undefined, { state: "refused" });
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByText("Corral won’t draft this one")).toBeInTheDocument();
  });

  it("opens a settings review state (M8)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await app(["settings"], { state: "reauth" });
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByRole("heading", { name: "Cal.com" })).toBeInTheDocument();
    expect(screen.getAllByText(/sign-in expired/).length).toBeGreaterThan(0);
  });

  it("opens a unibox handoff state (M8)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await app(undefined, { state: "meeting-cancelled" });
    render(AppLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(await screen.findByText("Grace cancelled the meeting")).toBeInTheDocument();
  });

  it("wraps onboarding in the session layout", async () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    const page = await OnboardingPage(params({}) as never);
    render(OnboardingLayout({ children: page, params: Promise.resolve({}) } as never));
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
  });
});
