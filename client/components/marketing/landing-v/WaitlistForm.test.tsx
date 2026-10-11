import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw";
import { WAITLIST } from "./copy";
import { WaitlistForm } from "./WaitlistForm";

const endpoint = () => new URL("/api/waitlist", window.location.origin).toString();
const reply = (status: number, body: Record<string, string>) => server.use(http.post(endpoint(), () => HttpResponse.json(body, { status })));

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_WAITLIST_MOCK", "0"));
afterEach(() => vi.unstubAllEnvs());

async function submit(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: WAITLIST.label }), email);
  await user.click(screen.getByRole("button", { name: WAITLIST.cta }));
  return user;
}

describe("WaitlistForm without script (server HTML)", () => {
  it("is a real form posting email + source to /api/waitlist with native validation", () => {
    const { container } = render(<WaitlistForm source="v2" />);
    const form = container.querySelector("form")!;
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/waitlist");
    expect(container.querySelector('input[type="hidden"][name="source"]')).toHaveValue("v2");
    const email = screen.getByRole("textbox", { name: WAITLIST.label });
    expect(email).toHaveAttribute("name", "email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toBeRequired();
  });

  it("renders the four #waitlist-* result lines only when asked", () => {
    const { container, rerender } = render(<WaitlistForm source="v1" />);
    expect(container.querySelector("#waitlist-joined")).toBeNull();
    rerender(<WaitlistForm source="v1" fragments />);
    for (const id of ["waitlist-joined", "waitlist-exists", "waitlist-invalid", "waitlist-error"]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("shows the note by default and hides it with note={false}", () => {
    const { rerender } = render(<WaitlistForm source="v1" />);
    expect(screen.getByText(WAITLIST.note)).toBeInTheDocument();
    rerender(<WaitlistForm source="v1" note={false} />);
    expect(screen.queryByText(WAITLIST.note)).toBeNull();
  });

  it("turns native validation off once hydrated, so the invalid state is the form's own", () => {
    const { container } = render(<WaitlistForm source="v1" />);
    expect((container.querySelector("form") as HTMLFormElement).noValidate).toBe(true);
  });

  it.each(["light", "blue", "dark"] as const)("carries the %s tone", (tone) => {
    const { container } = render(<WaitlistForm source="v1" tone={tone} align="center" />);
    expect(container.firstChild).toHaveClass(`wl--${tone}`, "wl--center");
  });
});

describe("WaitlistForm with script", () => {
  it("keeps the button full colour until typing, then dims it and only focuses the field until the address is valid", async () => {
    const hit = vi.fn();
    server.use(http.post(endpoint(), () => { hit(); return HttpResponse.json({}); }));
    const { container } = render(<WaitlistForm source="v1" />);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: WAITLIST.cta });
    const field = screen.getByRole("textbox", { name: WAITLIST.label });
    expect(button).not.toHaveAttribute("data-dim");
    await user.click(button);
    expect(field).toHaveFocus();
    expect(container.firstChild).toHaveAttribute("data-state", "idle");
    await user.type(field, "ada@");
    expect(button).toHaveAttribute("data-dim");
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(container.firstChild).toHaveAttribute("data-state", "idle");
    await user.type(field, "b.co");
    expect(button).not.toHaveAttribute("data-dim");
    expect(hit).not.toHaveBeenCalled();
  });

  it("shows invalid on Enter without calling the network, and clears it on the next keystroke", async () => {
    const hit = vi.fn();
    server.use(http.post(endpoint(), () => { hit(); return HttpResponse.json({}); }));
    const { container } = render(<WaitlistForm source="v1" />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: WAITLIST.label }), "nope{Enter}");
    expect(screen.getByText(WAITLIST.invalid)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: WAITLIST.label })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: WAITLIST.label })).toHaveFocus();
    expect(container.firstChild).toHaveAttribute("data-state", "invalid");
    expect(hit).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: WAITLIST.label }), "x");
    expect(container.firstChild).toHaveAttribute("data-state", "idle");
  });

  it("shows submitting while the request is in flight, then joined with the address", async () => {
    server.use(http.post(endpoint(), async () => { await delay(50); return HttpResponse.json({ status: "joined" }, { status: 201 }); }));
    const { container } = render(<WaitlistForm source="v3" />);
    await submit("  ada@b.co ");
    expect(container.firstChild).toHaveAttribute("data-state", "submitting");
    expect(screen.getByRole("textbox", { name: WAITLIST.label })).toHaveAttribute("readonly");
    await waitFor(() => expect(container.firstChild).toHaveAttribute("data-state", "joined"));
    expect(screen.getByRole("status")).toHaveTextContent(WAITLIST.joined.title);
    expect(screen.getByRole("status")).toHaveTextContent(WAITLIST.joined.body("ada@b.co"));
    expect(container.querySelector("form")).toBeNull();
  });

  it("ignores a second submit while one is in flight", async () => {
    const hit = vi.fn();
    server.use(http.post(endpoint(), async () => { hit(); await delay(80); return HttpResponse.json({ status: "joined" }, { status: 201 }); }));
    const { container } = render(<WaitlistForm source="v1" />);
    const user = await submit("ada@b.co");
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(container.firstChild).toHaveAttribute("data-state", "joined"));
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it("shows exists for a repeat", async () => {
    reply(200, { status: "exists" });
    const { container } = render(<WaitlistForm source="v1" />);
    await submit("ada@b.co");
    await waitFor(() => expect(container.firstChild).toHaveAttribute("data-state", "exists"));
    expect(screen.getByRole("status")).toHaveTextContent(WAITLIST.exists.title);
  });

  it("shows invalid when the server rejects the address, and focuses the field", async () => {
    reply(422, { error: "invalid_email" });
    const { container } = render(<WaitlistForm source="v1" />);
    await submit("ada@b.co");
    await waitFor(() => expect(container.firstChild).toHaveAttribute("data-state", "invalid"));
    expect(screen.getByRole("textbox", { name: WAITLIST.label })).toHaveFocus();
  });

  it("shows error on a server failure and lets the visitor try again", async () => {
    reply(500, { error: "server_error" });
    const { container } = render(<WaitlistForm source="v1" />);
    const user = await submit("ada@b.co");
    await waitFor(() => expect(container.firstChild).toHaveAttribute("data-state", "error"));
    expect(screen.getByText(WAITLIST.error)).toBeInTheDocument();
    reply(201, { status: "joined" });
    await user.type(screen.getByRole("textbox", { name: WAITLIST.label }), "m");
    expect(container.firstChild).toHaveAttribute("data-state", "idle");
    await user.click(screen.getByRole("button", { name: WAITLIST.cta }));
    await waitFor(() => expect(container.firstChild).toHaveAttribute("data-state", "joined"));
  });

  it("can be pinned to a state for the styleguide", () => {
    render(<WaitlistForm source="v1" initial="exists" initialEmail="ada@b.co" />);
    expect(screen.getByRole("status")).toHaveTextContent(WAITLIST.exists.body("ada@b.co"));
  });
});
