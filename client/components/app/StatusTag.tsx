import { STATUS_TAG, type StatusKind } from "@/lib/status/tags";
import { cx } from "./primitives";

/** The one status tag for background work (discovery runs, sequence launches). See lib/status/tags.ts. */
export function StatusTag({ kind, label }: { kind: StatusKind; /** Override the word, never the tone. */ label?: string }) {
  const t = STATUS_TAG[kind];
  return (
    <span className={cx("d-runtag", `is-${t.tone}`)} data-status={kind}>
      {t.dot !== "none" && <span className={cx("c-sdot", `c-sdot--${t.dot}`)} aria-hidden="true" />}{label ?? t.label}
    </span>
  );
}
