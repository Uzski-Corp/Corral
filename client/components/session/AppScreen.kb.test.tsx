import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API, ME_BODY, server, testConfig } from "@/test/msw";
import { kb, kbHandlers, productRow, resetKb, sourceRow } from "@/test/kbMock";
import { AppScreen } from "./AppScreen";
import { appDataFor, AppDataProvider, useAppData } from "./AppData";
import { SessionProvider } from "./SessionProvider";
import { decodeMe } from "@/lib/api";

const open = (props: Parameters<typeof AppScreen>[0] = {}) =>
  render(<SessionProvider config={testConfig()} navigator={{ assign: vi.fn(), replace: vi.fn() }}><AppScreen hotkeys={false} initialView="knowledge" {...props} /></SessionProvider>);

beforeEach(() => {
  resetKb({
    products: [productRow("p1", "ColdTrace Sensors"), productRow("p2", "ColdTrace Gateway", "2026-09-30T07:00:00Z")],
    sources: [
      sourceRow({ id: "s1", name: "T4 datasheet.pdf" }),
      sourceRow({ id: "s2", name: "Install guide.docx", kind: "docx", status: "failed", failure: "unreadable", failure_stage: "parse" }),
      sourceRow({ id: "s3", product_id: "p2", name: "Gateway manual.pdf" }),
    ],
  });
  server.use(...kbHandlers);
});

describe("AppScreen: the knowledge base on the API", () => {
  it("loads the first product's sources once /me has answered", async () => {
    open();
    await waitFor(() => expect(screen.getByText("T4 datasheet.pdf")).toBeInTheDocument());
    expect(screen.getByText("Install guide.docx")).toBeInTheDocument();
    expect(screen.queryByText("Gateway manual.pdf")).toBeNull();
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("ColdTrace Sensors")).toBeInTheDocument();
    expect(kb.calls).toContain("list");
  });

  it("switches product from the top bar", async () => {
    const user = userEvent.setup();
    open();
    await waitFor(() => expect(screen.getByText("T4 datasheet.pdf")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /ColdTrace Sensors/ }));
    await user.click(within(screen.getByRole("menu", { name: "Product" })).getByText("ColdTrace Gateway"));
    await waitFor(() => expect(screen.getByText("Gateway manual.pdf")).toBeInTheDocument());
    expect(screen.queryByText("T4 datasheet.pdf")).toBeNull();
  });

  it("shows Bau's error state when the API doesn't answer, and tries again", async () => {
    const user = userEvent.setup();
    server.use(http.get(`${API}/api/v1/products`, () => HttpResponse.json({ detail: "down" }, { status: 503 }), { once: true }));
    open();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load the knowledge base"));
    expect(screen.getByText("GET /api/v1/products · 503")).toBeInTheDocument();
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(screen.getByText("T4 datasheet.pdf")).toBeInTheDocument());
  });

  it("stays on Bau's sample data for a knowledge-base review state", async () => {
    open({ kb: "empty" });
    await waitFor(() => expect(within(screen.getByRole("button", { name: "Account" })).getByText("Wanjiru Mwangi")).toBeInTheDocument());
    expect(kb.calls).toEqual([]);
  });

  it("stays on the sample data in a review preview", async () => {
    open({ preview: "no-avatar" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 50));
    expect(kb.calls).toEqual([]);
  });
});

describe("AppData", () => {
  it("binds the APIs to the config and names the signed-in person", () => {
    const me = decodeMe(ME_BODY);
    if (!me.ok) throw new Error(me.error);
    const d = appDataFor(me.value, testConfig());
    expect(d.person).toEqual({ id: ME_BODY.user.id, name: "Wanjiru Mwangi" });
    const fake = { listProducts: vi.fn() } as never;
    expect(appDataFor(me.value, testConfig(), { kb: fake }).kb).toBe(fake);
    let seen: unknown = "unset";
    const Probe = () => { seen = useAppData(); return null; };
    render(<Probe />);
    expect(seen).toBeNull();
    render(<AppDataProvider value={d}><Probe /></AppDataProvider>);
    expect(seen).toBe(d);
  });
});
