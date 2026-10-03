/** Decoders for activity payloads. The server returns the screen's document; extra fields are kept. */
import { err, ok, type Result } from "../result";
import { isRecord } from "./decode";

export type Loose = Record<string, unknown>;

export const looseObject = (input: unknown): Result<Loose, string> =>
  isRecord(input) ? ok(input) : err("expected an object");

export const looseList = (input: unknown): Result<Loose[], string> =>
  Array.isArray(input) && input.every(isRecord) ? ok(input as Loose[]) : err("expected an array of objects");
