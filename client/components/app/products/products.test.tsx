import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server, testConfig } from "@/test/msw";
import { kbHandlers, productRow, resetKb } from "@/test/kbMock";
import { AppDemo } from "../AppDemo";
import { AppScreen } from "@/components/session/AppScreen";
import { SessionProvider } from "@/components/session/SessionProvider";

const open = (props: Parameters<typeof AppScreen>[0] = {}) =>
  render(<SessionProvider config={testConfig()} navigator={{ assign: vi.fn(), replace: vi.fn() }}><AppScreen hotkeys={false} initialView="products" {...props} /></SessionProvider>);

beforeEach(() => {
  resetKb({ products: [productRow("p1", "Thamani Dawa", "2026-09-01T08:00:00Z", "Pharmacy and lab management software")] });
  server.use(...kbHandlers);
});

describe("Products", () => {
  it("lists the product saved during setup", async () => {
    open();
    expect(await screen.findByRole("button", { name: /Thamani Dawa/ }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("Pharmacy and lab management software")).toBeInTheDocument();
    expect(screen.queryByText(/designed in a later milestone/i)).toBeNull();
  });

  it("opens that product’s knowledge base", async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole("button", { name: /Thamani Dawa/ }));
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Thamani Dawa")).toBeInTheDocument());
  });

  it("adds another product", async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole("button", { name: /Thamani Dawa/ });
    await user.click(screen.getByRole("button", { name: "Add a product" }));
    await user.type(screen.getByLabelText("Product name"), "Gateway");
    await user.type(screen.getByLabelText(/What it does/), "A second product.");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("button", { name: /Gateway/ })).toBeInTheDocument();
    expect(screen.getByText("A second product.")).toBeInTheDocument();
  });

  it("says when the workspace has none", async () => {
    resetKb({ products: [] });
    open();
    expect(await screen.findByText("No products yet")).toBeInTheDocument();
    expect(screen.queryByText(/designed in a later milestone/i)).toBeNull();
  });

  it("keeps the sample shell on the milestone placeholder", () => {
    render(<AppDemo hotkeys={false} initialView="products" />);
    expect(screen.getByText(/designed in a later milestone/i)).toBeInTheDocument();
  });
});
