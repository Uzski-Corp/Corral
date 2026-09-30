/**
 * A tiny Result type so fallible calls return their failure instead of throwing it.
 * Callers must look at `ok` before they can reach `value` (the Go `if err != nil` habit,
 * or Rust's `Result<T, E>`, with the compiler doing the checking).
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
