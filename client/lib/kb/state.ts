/**
 * Design-review states for /app?view=knowledge&state= (M2, ENG-52). Honoured where review states
 * are (outside production and in the review build). Plain module so the server page can read it.
 *
 * empty          no sources yet: the first-run drop zone
 * loading        first load of the knowledge base (skeleton list and document)
 * error          the knowledge base couldn't load
 * drafting       first source still being read; the page isn't drafted yet
 * sources        the Sources tab, with live processing, a partial and a failed source
 * source         a ready source open in the detail panel
 * partial        partly read: 31 of 38 pages used, 7 scanned pages skipped (no OCR), the page strip, Upload a text version
 * failed         a source that couldn't be read (password-protected PDF)
 * unreadable     M10b: failure `unreadable` at parse (a damaged PDF), Replace file, What happened
 * interrupted    M10b: failure `interrupted` at embed, retries used up, Try again, What happened open
 * upload         Add sources dialog, mid-upload
 * upload-errors  Add sources dialog with every failure: upload stopped, unsupported, too large, password, duplicate
 * dragging       files dragged over the page
 * tray           dialog closed while uploads keep going (the corner tray)
 * editing        a knowledge item open for editing
 * save-error     an edit that couldn't be saved
 * conflict       two sources disagree (opened on the pricing item)
 */
export const KB_REVIEW_STATES = [
  "empty", "drafting", "loading", "error", "sources", "source", "partial", "failed", "unreadable", "interrupted", "upload", "upload-errors", "dragging", "tray", "editing", "save-error", "conflict",
] as const;
export type KbReviewState = (typeof KB_REVIEW_STATES)[number];

export function kbReviewState(view: string | undefined, state: string | undefined, reviewStates: boolean): KbReviewState | undefined {
  if (!reviewStates || view !== "knowledge") return undefined;
  return KB_REVIEW_STATES.find((s) => s === state);
}
