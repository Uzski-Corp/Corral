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

/* ------------------------------------------------------------ record readers
   For the larger domain shapes (knowledge base, leads): read fields by name with a path in every
   message, and turn the first mismatch into the decoder's `err`. Unknown extra fields are ignored,
   so the API can add fields without breaking older clients. */
class Mismatch extends Error {}

export type Reader = {
  readonly path: string;
  str(key: string): string;
  optStr(key: string): string | null;
  num(key: string): number;
  optNum(key: string): number | null;
  bool(key: string): boolean;
  optBool(key: string): boolean | null;
  oneOf<const V extends string>(key: string, values: readonly V[]): V;
  optOneOf<const V extends string>(key: string, values: readonly V[]): V | null;
  obj(key: string): Reader;
  optObj(key: string): Reader | null;
  list<T>(key: string, item: (r: Reader) => T): T[];
  strList(key: string): string[];
  raw(key: string): unknown;
};

const kindOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

export function reader(input: unknown, path: string): Reader {
  if (!isRecord(input)) throw new Mismatch(`${path}: expected an object, got ${kindOf(input)}`);
  const at = (k: string) => `${path}.${k}`;
  const fail = (k: string, what: string): never => { throw new Mismatch(`${at(k)}: expected ${what}, got ${kindOf(input[k])}`); };
  const opt = <T>(k: string, read: (k: string) => T): T | null => (input[k] === null || input[k] === undefined ? null : read(k));
  const r: Reader = {
    path,
    str: (k) => (typeof input[k] === "string" ? (input[k] as string) : fail(k, "string")),
    optStr: (k) => opt(k, r.str),
    num: (k) => (typeof input[k] === "number" && Number.isFinite(input[k]) ? (input[k] as number) : fail(k, "number")),
    optNum: (k) => opt(k, r.num),
    bool: (k) => (typeof input[k] === "boolean" ? (input[k] as boolean) : fail(k, "boolean")),
    optBool: (k) => opt(k, r.bool),
    oneOf: (k, values) => {
      const v = input[k];
      if (typeof v === "string" && (values as readonly string[]).includes(v)) return v as (typeof values)[number];
      return fail(k, `one of ${values.join(" | ")}`);
    },
    optOneOf: (k, values) => opt(k, (key) => r.oneOf(key, values)),
    obj: (k) => reader(input[k], at(k)),
    optObj: (k) => opt(k, r.obj),
    list: (k, item) => (Array.isArray(input[k]) ? (input[k] as unknown[]).map((v, i) => item(reader(v, `${at(k)}[${i}]`))) : fail(k, "array")),
    strList: (k) => (Array.isArray(input[k]) && (input[k] as unknown[]).every((v) => typeof v === "string") ? (input[k] as string[]) : fail(k, "array of strings")),
    raw: (k) => input[k],
  };
  return r;
}

/** A decoder for one object: `read` pulls fields; the first mismatch becomes the error. */
export function recordDecoder<T>(path: string, read: (r: Reader) => T): (input: unknown) => Result<T, string> {
  return (input) => {
    try { return ok(read(reader(input, path))); } catch (e) { if (e instanceof Mismatch) return err(e.message); throw e; }
  };
}

/** A decoder for a JSON array of objects. */
export function listDecoder<T>(path: string, read: (r: Reader) => T): (input: unknown) => Result<T[], string> {
  return (input) => {
    if (!Array.isArray(input)) return err(`${path}: expected an array, got ${kindOf(input)}`);
    try { return ok(input.map((v, i) => read(reader(v, `${path}[${i}]`)))); } catch (e) { if (e instanceof Mismatch) return err(e.message); throw e; }
  };
}
