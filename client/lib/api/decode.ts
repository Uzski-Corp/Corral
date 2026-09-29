/** Hand-rolled decoders for the few API shapes the client reads. Each returns a Result. */
import { err, ok, type Result } from "../result";

export type Json = Record<string, unknown>;

export const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export function field<T>(obj: Json, key: string, check: (v: unknown) => v is T, what: string, path: string): Result<T, string> {
  const v = obj[key];
  return check(v) ? ok(v) : err(`${path}.${key}: expected ${what}, got ${v === null ? "null" : typeof v}`);
}

export const isString = (v: unknown): v is string => typeof v === "string";
export const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
export const isOptionalString = (v: unknown): v is string | null | undefined => v === null || v === undefined || typeof v === "string";

/** Absolute http(s) URL; anything else (javascript:, relative, garbage) is rejected. */
export const isHttpUrl = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};
