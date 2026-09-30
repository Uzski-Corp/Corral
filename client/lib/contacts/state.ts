/**
 * Design-review states for Contacts (M10 states audit, ENG-60). Honoured where review states are
 * (outside production and in the review build). Plain module so the server page can read it.
 *
 * /app?view=contacts&state=
 *   loading   the table skeleton at 40px rows
 *   empty     no contacts yet: they arrive as Corral reads companies, Find companies
 *   error     contacts couldn’t load; nothing lost, Try again
 */
export const CONTACTS_REVIEW_STATES = ["loading", "empty", "error"] as const;
export type ContactsReviewState = (typeof CONTACTS_REVIEW_STATES)[number];

export function contactsReviewState(view: string | undefined, state: string | undefined, reviewStates: boolean): ContactsReviewState | undefined {
  if (!reviewStates || view !== "contacts") return undefined;
  return CONTACTS_REVIEW_STATES.find((s) => s === state);
}
