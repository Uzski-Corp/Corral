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
 * partial        a source that was only partly read (scanned pages)
 * failed         a source that couldn't be read (password-protected PDF)
 * upload         Add sources dialog, mid-upload
 * upload-errors  Add sources dialog with every failure: interrupted, unsupported, too large, password, duplicate
 * dragging       files dragged over the page
 * tray           dialog closed while uploads keep going (the corner tray)
 * editing        a knowledge item open for editing
 * save-error     an edit that couldn't be saved
 * conflict       two sources disagree (opened on the pricing item)
 */
export const KB_REVIEW_STATES = [
  "empty", "drafting", "loading", "error", "sources", "source", "partial", "failed", "upload", "upload-errors", "dragging", "tray", "editing", "save-error", "conflict",
] as const;
export type KbReviewState = (typeof KB_REVIEW_STATES)[number];

export function kbReviewState(view: string | undefined, state: string | undefined, reviewStates: boolean): KbReviewState | undefined {
  if (!reviewStates || view !== "knowledge") return undefined;
  return KB_REVIEW_STATES.find((s) => s === state);
}
