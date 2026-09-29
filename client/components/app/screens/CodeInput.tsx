"use client";
/* Six-digit sign-in code (ENG-80). ONE real <input> drawn as six cells: one-time-code autofill,
   paste of the whole code, numeric keyboard and a single accessible name all come for free; the
   cells are decoration (aria-hidden). Fires onComplete once when the sixth digit lands.        */
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { CODE_LENGTH, sanitizeCode } from "@/lib/auth/code";
import { cx } from "../primitives";

export type CodeInputHandle = { focus: (select?: boolean) => void };
export type CodeInputProps = {
  id: string; value: string; onChange: (code: string) => void; onComplete?: (code: string) => void;
  invalid?: boolean; disabled?: boolean; busy?: boolean; describedBy?: string; autoFocus?: boolean;
};

export const CodeInput = forwardRef<CodeInputHandle, CodeInputProps>(function CodeInput(
  { id, value, onChange, onComplete, invalid, disabled, busy, describedBy, autoFocus }, ref,
) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [all, setAll] = useState(false);
  useImperativeHandle(ref, () => ({ focus: (select) => { input.current?.focus(); if (select) { input.current?.select(); setAll(true); } } }), []);
  const change = (raw: string) => {
    const next = sanitizeCode(raw);
    setAll(false);
    onChange(next);
    if (next.length === CODE_LENGTH && next !== value) onComplete?.(next);
  };
  const caret = focused && !disabled && !busy && !all ? Math.min(value.length, CODE_LENGTH - 1) : -1;
  return (
    <div className={cx("s-code", invalid && "is-invalid", disabled && "is-disabled", busy && "is-busy", focused && "is-focus")}>
      <input ref={input} id={id} className="s-code__input" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code"
        autoCorrect="off" spellCheck={false} enterKeyHint="go" value={value} disabled={disabled} readOnly={busy} autoFocus={autoFocus}
        aria-invalid={invalid || undefined} aria-describedby={describedBy} aria-busy={busy || undefined}
        onChange={(e) => change(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setAll(false); }}
        onSelect={(e) => { const t = e.currentTarget; setAll(t.value.length > 0 && t.selectionStart === 0 && t.selectionEnd === t.value.length); }} />
      <div className="s-code__cells" aria-hidden="true">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <span key={i} className={cx("s-code__cell", i < value.length && "is-filled", i === caret && "is-caret", all && i < value.length && "is-sel", i === 2 && "is-gap")}>
            {value[i] ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
});
