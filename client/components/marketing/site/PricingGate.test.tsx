import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw";
import { PricingGate } from "./PricingGate";
import { PRICING_GATE as C } from "./pricing-gate-copy";

const endpoint = () => new URL("/api/pricing-intent", window.location.origin).toString();
let bodies: Record<string, unknown>[] = [];
const reply = (status: number, json: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  server.use(http.post(endpoint(), async ({ request }) => { bodies.push((await request.json()) as Record<string, unknown>); return HttpResponse.json(json, { status, headers }); }));

function Page({ source }: { source?: "hero" | "nav" | "footer" | "pricing-page" }) {
  return <div className="lv" data-testid="root"><nav><button type="button">home</button></nav><main><h1>Pricing, by email.</h1><PricingGate source={source} /></main></div>;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_PRICING_MOCK", "0");
  bodies = [];
  window.history.replaceState(null, "", "/pricing");
  document.documentElement.style.overflow = "";
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const opener = () => screen.getByRole("button", { name: C.open });
const dialog = () => screen.getByRole("dialog", { name: C.dialog.title });
const name = () => screen.getByRole("textbox", { name: C.fields.fullName.label });
const email = () => screen.getByRole("textbox", { name: C.fields.email.label });
const phone = () => screen.getByRole("textbox", { name: new RegExp(C.fields.phone.label) });
const industry = () => screen.getByRole("combobox", { name: C.fields.industry.label });
const submitBtn = () => within(dialog()).getByRole("button", { name: new RegExp(`${C.submit}|${C.failure.retry}|${C.limited.button(".*")}|${C.busy}`) });

async function openGate() {
  const user = userEvent.setup();
  render(<Page />);
  await user.click(opener());
  return user;
}
async function pick(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(industry());
  await user.click(screen.getByRole("option", { name: label }));
}
async function fillGood(user: ReturnType<typeof userEvent.setup>, over: { email?: string; phone?: string } = {}) {
  await user.type(name(), "Wanjiru Kamau");
  await pick(user, "Agriculture and food");
  await user.type(email(), over.email ?? "wanjiru@acme.co");
  if (over.phone) await user.type(phone(), over.phone);
}

describe("the page's one button", () => {
  it("is See pricing, carries the analytics markers, and opens nothing by itself", () => {
    render(<Page />);
    expect(opener()).toHaveClass("c-btn", "c-btn--ink", "c-btn--lg", "pg-cta");
    expect(opener()).toHaveAttribute("data-ab-event", "pricing_cta_click");
    expect(opener()).toHaveAttribute("data-ab-placement", "hero");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe("");
  });
  it("records where it was pressed", () => {
    render(<Page source="nav" />);
    expect(opener()).toHaveAttribute("data-ab-placement", "nav");
  });
  it("opens the dialog, pushes ?gate=1, and Back closes it", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await user.click(opener());
    expect(dialog()).toBeInTheDocument();
    expect(window.location.search).toBe("?gate=1");
    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("");
  });
  it("opens on load at /pricing?gate=1", async () => {
    window.history.replaceState(null, "", "/pricing?gate=1");
    render(<Page />);
    expect(await screen.findByRole("dialog", { name: C.dialog.title })).toBeInTheDocument();
  });
  it("stays closed for other values of ?gate", () => {
    window.history.replaceState(null, "", "/pricing?gate=0");
    render(<Page />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("closing a dialog that was opened by URL removes ?gate=1 in place", async () => {
    window.history.replaceState(null, "", "/pricing?gate=1&x=2");
    const user = userEvent.setup();
    render(<Page />);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: C.dialog.close }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe("?x=2");
  });
  it("stops listening for Back when it unmounts", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    render(<Page />).unmount();
    expect(remove).toHaveBeenCalledWith("popstate", expect.any(Function));
  });
});

describe("the dialog", () => {
  it("is a named, modal dialog with the designed head, four fields and one consent line", async () => {
    await openGate();
    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(within(dialog()).getByRole("heading", { name: C.dialog.title })).toBeInTheDocument();
    expect(screen.getByText(C.dialog.description)).toBeInTheDocument();
    expect(name()).toHaveAttribute("autocomplete", "name");
    expect(email()).toHaveAttribute("type", "email");
    expect(email()).toHaveAttribute("autocomplete", "email");
    expect(phone()).toHaveAttribute("type", "tel");
    expect(phone()).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByText(C.fields.phone.optional)).toBeInTheDocument();
    expect(screen.getByText(C.fields.email.hint)).toBeInTheDocument();
    expect(screen.getByText(C.fields.phone.hint)).toBeInTheDocument();
    expect(industry()).toHaveTextContent(C.fields.industry.placeholder);
    expect(screen.getByRole("link", { name: C.consent.link })).toHaveAttribute("href", "/legal/privacy");
    expect(dialog().querySelector(".pg-consent")).toHaveTextContent(`${C.consent.before}${C.consent.link}${C.consent.after}`);
    expect(submitBtn()).toHaveAttribute("data-ab-event", "pricing_gate_submit");
    expect(submitBtn()).not.toHaveAttribute("aria-disabled");
  });
  it("focuses the first field, locks scroll, and makes the rest of the page inert", async () => {
    await openGate();
    expect(name()).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(screen.getByRole("navigation", { hidden: true }).closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert");
    expect(dialog().closest("[inert]")).toBeNull();
  });
  it("undoes all of that and returns focus to the button on close", async () => {
    const user = await openGate();
    await user.click(screen.getByRole("button", { name: C.dialog.close }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.documentElement.style.overflow).toBe("");
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    await waitFor(() => expect(opener()).toHaveFocus());
  });
  it("closes with Escape and with a click on the scrim, but not a click inside", async () => {
    const user = await openGate();
    await user.click(dialog());
    expect(dialog()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(opener());
    const scrim = dialog().parentElement!;
    await user.pointer({ keys: "[MouseLeft]", target: scrim });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("Escape closes the industry menu first, then the dialog", async () => {
    const user = await openGate();
    await user.click(industry());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(dialog()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("keeps Tab inside the dialog", async () => {
    const user = await openGate();
    await user.click(screen.getByRole("button", { name: C.dialog.close }));
    // after closing, reopen and tab around: focus never leaves the dialog
    await user.click(opener());
    for (let i = 0; i < 12; i += 1) { await user.tab(); expect(dialog().contains(document.activeElement)).toBe(true); }
  });
  it("has a bottom-sheet grabber that assistive tech skips", async () => {
    await openGate();
    expect(dialog().querySelector(".pg-sheetbar")).toHaveAttribute("aria-hidden", "true");
  });
  it("has a hidden honeypot field", async () => {
    await openGate();
    const hp = dialog().querySelector('input[name="website"]')!;
    expect(hp.closest(".pg-hp")).toHaveAttribute("aria-hidden", "true");
    expect(hp).toHaveAttribute("tabindex", "-1");
  });
});

describe("validation", () => {
  it("shows every message on a blank submit, focuses the first bad field, and sends nothing", async () => {
    const user = await openGate();
    await user.click(submitBtn());
    expect(screen.getByText(C.errors.fullName)).toHaveAttribute("role", "alert");
    expect(screen.getByText(C.errors.industry)).toBeInTheDocument();
    expect(screen.getByText(C.errors.email)).toBeInTheDocument();
    expect(screen.queryByText(C.errors.phone)).toBeNull();
    expect(name()).toHaveFocus();
    expect(name()).toHaveAttribute("aria-invalid", "true");
    expect(name()).toHaveAccessibleDescription(C.errors.fullName);
    expect(industry()).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toHaveLength(0);
  });
  it("focuses industry, then email, then phone as the earlier ones are fixed", async () => {
    const user = await openGate();
    await user.type(name(), "W");
    await user.click(submitBtn());
    expect(industry()).toHaveFocus();
    await pick(user, "Healthcare");
    await user.click(submitBtn());
    expect(email()).toHaveFocus();
    await user.type(email(), "w@acme.co");
    await user.type(phone(), "0712345678");
    await user.click(submitBtn());
    expect(phone()).toHaveFocus();
    expect(screen.getByText(C.errors.phone)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });
  it("clears an error as soon as the field is valid, and re-checks on blur once touched", async () => {
    const user = await openGate();
    await user.click(submitBtn());
    await user.type(name(), "W");
    expect(screen.queryByText(C.errors.fullName)).toBeNull();
    await user.clear(name());
    expect(screen.getByText(C.errors.fullName)).toBeInTheDocument();
    await user.type(email(), "nope");
    expect(screen.getByText(C.errors.email)).toBeInTheDocument();
    await user.type(email(), "@acme.co");
    expect(screen.queryByText(C.errors.email)).toBeNull();
  });
  it("does not nag about an untouched field while typing in another", async () => {
    const user = await openGate();
    await user.type(name(), "W");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(email());
    await user.tab(); // blur an empty email: now it is touched, so it says so
    expect(screen.getByText(C.errors.email)).toBeInTheDocument();
  });
  it("replaces the email hint with the error, and brings the hint back when valid", async () => {
    const user = await openGate();
    await user.type(email(), "x");
    await user.tab();
    expect(screen.queryByText(C.fields.email.hint)).toBeNull();
    await user.type(email(), "@acme.co");
    expect(screen.getByText(C.fields.email.hint)).toBeInTheDocument();
    expect(email()).toHaveAccessibleDescription(C.fields.email.hint);
  });
  it("shows a phone error, then accepts a corrected number", async () => {
    const user = await openGate();
    await user.type(phone(), "712 345");
    await user.tab();
    expect(screen.getByText(C.errors.phone)).toBeInTheDocument();
    await user.clear(phone());
    expect(screen.queryByText(C.errors.phone)).toBeNull();
    await user.type(phone(), "+254 712 345 678");
    expect(screen.queryByText(C.errors.phone)).toBeNull();
  });
  it("groups a Kenyan number on blur but leaves other countries as typed", async () => {
    const user = await openGate();
    await user.type(phone(), "+254712345678");
    await user.tab();
    expect(phone()).toHaveValue("+254 712 345 678");
    await user.clear(phone());
    await user.type(phone(), "+1 415 555 0100");
    await user.tab();
    expect(phone()).toHaveValue("+1 415 555 0100");
  });
});

describe("the Other industry", () => {
  it("reveals 'Your industry' with a counter and focus, and requires it", async () => {
    const user = await openGate();
    expect(screen.queryByRole("textbox", { name: C.fields.other.label })).toBeNull();
    await pick(user, "Other");
    const other = screen.getByRole("textbox", { name: C.fields.other.label });
    expect(other).toHaveFocus();
    expect(other).toHaveAttribute("maxlength", "60");
    expect(screen.getByText("0 / 60")).toBeInTheDocument();
    await user.type(other, "Beekeeping");
    expect(screen.getByText("10 / 60")).toBeInTheDocument();
    await user.clear(other);
    await user.tab();
    expect(screen.getByText(C.errors.otherText)).toBeInTheDocument();
  });
  it("hides it again, drops its error, and does not send it, when another industry is chosen", async () => {
    const user = await openGate();
    await pick(user, "Other");
    await user.click(submitBtn());
    expect(screen.getByText(C.errors.otherText)).toBeInTheDocument();
    await pick(user, "Education");
    expect(screen.queryByRole("textbox", { name: C.fields.other.label })).toBeNull();
    expect(screen.queryByText(C.errors.otherText)).toBeNull();
    await user.type(name(), "W");
    await user.type(email(), "w@acme.co");
    reply(202, { status: "queued" });
    await user.click(submitBtn());
    await screen.findByText(C.success.title);
    expect(bodies[0]).toMatchObject({ industry: "education" });
    expect(bodies[0]).not.toHaveProperty("otherText");
  });
  it("sends the other text, cleaned", async () => {
    const user = await openGate();
    await user.type(name(), "W");
    await pick(user, "Other");
    await user.type(screen.getByRole("textbox", { name: C.fields.other.label }), "  Bee   keeping ");
    await user.type(email(), "w@acme.co");
    reply(202);
    await user.click(submitBtn());
    await screen.findByText(C.success.title);
    expect(bodies[0]).toMatchObject({ industry: "other", otherText: "Bee keeping" });
  });
});

describe("the free-mail note", () => {
  it("shows on blur for a personal address, with Send anyway, and does not block typing", async () => {
    const user = await openGate();
    await user.type(email(), "wanjiru@gmail.com");
    await user.tab();
    expect(screen.getByText(C.freeMail.note, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: C.freeMail.send })).toBeInTheDocument();
    expect(email()).not.toHaveAttribute("aria-invalid");
  });
  it("stops the first submit with the note and lets the second through", async () => {
    const user = await openGate();
    await fillGood(user, { email: "wanjiru@gmail.com" });
    await user.click(submitBtn());
    expect(bodies).toHaveLength(0);
    expect(screen.getByRole("button", { name: C.freeMail.send })).toBeInTheDocument();
    expect(email()).toHaveFocus();
    reply(202);
    await user.click(submitBtn());
    await screen.findByText(C.success.title);
    expect(bodies).toHaveLength(1);
  });
  it("Send anyway submits at once", async () => {
    const user = await openGate();
    await fillGood(user, { email: "wanjiru@yahoo.co.uk" });
    await user.tab();
    reply(202);
    await user.click(screen.getByRole("button", { name: C.freeMail.send }));
    await screen.findByText(C.success.title);
    expect(bodies[0]).toMatchObject({ email: "wanjiru@yahoo.co.uk" });
  });
  it("forgets the acknowledgement when the address changes", async () => {
    const user = await openGate();
    await fillGood(user, { email: "w@gmail.com" });
    await user.click(submitBtn()); // note
    await user.clear(email());
    await user.type(email(), "w@live.com"); // edit -> note and ack reset
    expect(screen.queryByRole("button", { name: C.freeMail.send })).toBeNull();
    await user.tab();
    expect(screen.getByRole("button", { name: C.freeMail.send })).toBeInTheDocument();
  });
  it("does not show for a work address, and not again once acknowledged and blurred", async () => {
    const user = await openGate();
    await user.type(email(), "w@acme.co");
    await user.tab();
    expect(screen.queryByRole("button", { name: C.freeMail.send })).toBeNull();
  });
  it("an invalid personal-looking address gets the error, not the note", async () => {
    const user = await openGate();
    await user.type(email(), "gmail.com");
    await user.tab();
    expect(screen.getByText(C.errors.email)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: C.freeMail.send })).toBeNull();
  });
});

describe("sending", () => {
  it("posts the form, shows Sending with fields locked, then the success card with the address", async () => {
    server.use(http.post(endpoint(), async ({ request }) => { bodies.push((await request.json()) as Record<string, unknown>); await delay(50); return HttpResponse.json({ status: "queued" }, { status: 202 }); }));
    const user = await openGate();
    await fillGood(user, { phone: "+254 712 345 678" });
    await user.click(submitBtn());
    expect(submitBtn()).toHaveAttribute("aria-disabled", "true");
    expect(submitBtn()).toHaveTextContent(`${C.busy}…`);
    expect(name()).toHaveAttribute("readonly");
    expect(email()).toHaveAttribute("readonly");
    await user.click(submitBtn()); // a second press while sending does nothing
    const title = await screen.findByText(C.success.title);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ fullName: "Wanjiru Kamau", industry: "agriculture-food", email: "wanjiru@acme.co", phone: "+254712345678", source: "hero", website: "" });
    expect(title).toHaveFocus();
    expect(screen.getByText(C.success.body("wanjiru@acme.co"))).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(C.dialog.description)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("normalises the address shown and sent", async () => {
    const user = await openGate();
    await fillGood(user, { email: "  Wanjiru@Acme.CO " });
    reply(202);
    await user.click(submitBtn());
    expect(await screen.findByText(C.success.body("wanjiru@acme.co"))).toBeInTheDocument();
  });
  it("sends the honeypot value if a bot filled it, and the page's source", async () => {
    render(<Page source="footer" />);
    const user = userEvent.setup();
    await user.click(opener());
    await fillGood(user);
    const hp = dialog().querySelector<HTMLInputElement>('input[name="website"]')!;
    await user.type(hp, "bot");
    reply(202);
    await user.click(submitBtn());
    await screen.findByText(C.success.title);
    expect(bodies[0]).toMatchObject({ website: "bot", source: "footer" });
  });
  it("Close on the success card closes the dialog", async () => {
    const user = await openGate();
    await fillGood(user);
    reply(202);
    await user.click(submitBtn());
    await screen.findByText(C.success.title);
    await user.click(dialog().querySelector<HTMLElement>(".c-dialog__foot button")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("send it again re-sends the same details and ends on success again", async () => {
    const user = await openGate();
    await fillGood(user);
    reply(202);
    await user.click(submitBtn());
    await screen.findByText(C.success.title);
    await user.click(screen.getByRole("button", { name: C.success.again }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual(bodies[0]);
    expect(await screen.findByText(C.success.title)).toBeInTheDocument();
  });
});

describe("when it goes wrong", () => {
  it("failure: a banner, answers kept, the button reads Try again, and a retry can succeed", async () => {
    reply(500);
    const user = await openGate();
    await fillGood(user, { phone: "+254712345678" });
    await user.click(submitBtn());
    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(C.failure.title);
    expect(banner).toHaveTextContent(C.failure.body);
    expect(name()).toHaveValue("Wanjiru Kamau");
    expect(email()).toHaveValue("wanjiru@acme.co");
    expect(submitBtn()).toHaveTextContent(C.failure.retry);
    expect(submitBtn()).not.toHaveAttribute("aria-disabled");
    reply(202);
    await user.click(submitBtn());
    await screen.findByText(C.success.title);
    expect(bodies).toHaveLength(2);
  });
  it("a network failure is the same failure state", async () => {
    server.use(http.post(endpoint(), () => HttpResponse.error()));
    const user = await openGate();
    await fillGood(user);
    await user.click(submitBtn());
    expect(await screen.findByText(C.failure.title)).toBeInTheDocument();
  });
  it("the server naming a field sends the person back to it with its message", async () => {
    reply(422, { error: "invalid_field", field: "phone" });
    const user = await openGate();
    await fillGood(user);
    await user.click(submitBtn());
    expect(await screen.findByText(C.errors.phone)).toBeInTheDocument();
    await waitFor(() => expect(phone()).toHaveFocus());
    expect(screen.queryByText(C.failure.title)).toBeNull();
  });
  it("rate limited: a caution banner, a disabled button with the wait from Retry-After, answers kept", async () => {
    reply(429, { error: "rate_limited" }, { "retry-after": "600" });
    const user = await openGate();
    await fillGood(user);
    await user.click(submitBtn());
    const banner = await screen.findByText(C.limited.title);
    expect(banner.closest(".c-banner--caution")).not.toBeNull();
    expect(screen.getByText(C.limited.body)).toBeInTheDocument();
    expect(submitBtn()).toHaveTextContent("Try again in 10 minutes");
    expect(submitBtn()).toHaveAttribute("aria-disabled", "true");
    expect(submitBtn()).toHaveAttribute("data-dim");
    expect(name()).toHaveValue("Wanjiru Kamau");
    await user.click(submitBtn()); // does nothing while limited
    expect(bodies).toHaveLength(1);
  });
  it("rate limited: the button comes back when the wait is over", async () => {
    reply(429, {}, { "retry-after": "1" });
    const user = await openGate();
    await fillGood(user);
    await user.click(submitBtn());
    await screen.findByText(C.limited.title);
    expect(submitBtn()).toHaveTextContent("Try again in 1 minute");
    await waitFor(() => expect(screen.queryByText(C.limited.title)).toBeNull(), { timeout: 3000 });
    expect(submitBtn()).toHaveTextContent(C.submit);
    expect(submitBtn()).not.toHaveAttribute("aria-disabled");
  });
});

describe("analytics markers", () => {
  it("marks the dialog as the pricing-gate section", async () => {
    await openGate();
    expect(dialog().parentElement).toHaveAttribute("data-ab-section", "pricing-gate");
  });
});
