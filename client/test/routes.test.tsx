import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigCache } from "@/lib/config";
import AppLayout from "@/app/app/layout";
import ContactsPage, { metadata as contactsMeta } from "@/app/app/contacts/page";
import ProductsPage, { metadata as productsMeta } from "@/app/app/products/page";
import SegmentsPage, { metadata as segmentsMeta } from "@/app/app/segments/page";
import SegmentPage from "@/app/app/segments/[segment]/page";
import BillingPage from "@/app/app/settings/billing/page";
import SmsPage from "@/app/app/settings/sms/page";
import DocsPage from "@/app/app/settings/docs/page";
import KeysPage from "@/app/app/settings/keys/page";
import McpPage from "@/app/app/settings/mcp/page";
import ProfilePage from "@/app/app/settings/profile/page";
import TeamPage from "@/app/app/settings/team/page";
import WorkspacePage from "@/app/app/settings/workspace/page";

const search = { searchParams: Promise.resolve({}) };

afterEach(() => { vi.unstubAllEnvs(); resetConfigCache(); });

async function show(page: Promise<React.ReactElement>) {
  vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
  resetConfigCache();
  render(AppLayout({ children: await page, params: Promise.resolve({}) } as never));
  return within(screen.getByRole("navigation", { name: "Breadcrumb" }));
}

describe("every /app route folder renders its own screen", () => {
  it("names each page after its view", () => {
    expect(contactsMeta.title).toBe("Contacts");
    expect(productsMeta.title).toBe("Products");
    expect(segmentsMeta.title).toBe("Segments");
  });

  it.each([
    ["contacts", () => ContactsPage(search), "Contacts"],
    ["products", () => ProductsPage(search), "Products"],
    ["segments", () => SegmentsPage(search), "Segments"],
  ] as const)("/app/%s", async (_, page, crumb) => {
    const nav = await show(page());
    expect(nav.getAllByText(crumb).length).toBeGreaterThan(0);
  });

  it("/app/segments/[segment] opens that segment", async () => {
    const nav = await show(SegmentPage({ params: Promise.resolve({ segment: "seg-1" }), ...search }));
    expect(nav.getAllByText(/Segments/).length).toBeGreaterThan(0);
  });

  it.each([
    ["billing", BillingPage],
    ["sms", SmsPage],
    ["docs", DocsPage],
    ["keys", KeysPage],
    ["mcp", McpPage],
    ["profile", ProfilePage],
    ["team", TeamPage],
    ["workspace", WorkspacePage],
  ] as const)("/app/settings/%s", async (_, Page) => {
    const nav = await show(Page(search));
    expect(nav.getAllByText("Settings").length).toBeGreaterThan(0);
  });
});
