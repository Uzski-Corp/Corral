import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppDemo } from "./AppDemo";
import { CONTACTS_REVIEW_STATES, contactsReviewState } from "@/lib/contacts/state";

const show = (contacts?: (typeof CONTACTS_REVIEW_STATES)[number]) => render(<AppDemo initialView="contacts" contacts={contacts} hotkeys={false} />);

describe("Contacts states (M10)", () => {
  it("reads the state only on the contacts view, with review states on", () => {
    expect(contactsReviewState("contacts", "empty", true)).toBe("empty");
    expect(contactsReviewState("companies", "empty", true)).toBeUndefined();
    expect(contactsReviewState("contacts", "empty", false)).toBeUndefined();
    expect(contactsReviewState("contacts", "nope", true)).toBeUndefined();
  });
  it("loading holds the table skeleton", () => {
    show("loading");
    expect(screen.getByRole("status", { name: "Loading contacts" })).toBeInTheDocument();
  });
  it("empty says where people come from, and Find companies goes to discovery", async () => {
    show("empty");
    expect(screen.getByText("No contacts yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Find companies/ }));
    expect(screen.queryByText("No contacts yet")).not.toBeInTheDocument();
  });
  it("error says nothing is lost, shows the request, and Try again reloads", async () => {
    show("error");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load contacts"); expect(screen.getByText("Couldn’t load contacts")).toBeInTheDocument();
    expect(screen.getByText("GET /api/v1/contacts · 503")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(screen.getByRole("status", { name: "Loading contacts" })).toBeInTheDocument();
  });
});
