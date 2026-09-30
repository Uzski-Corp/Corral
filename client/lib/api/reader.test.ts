import { describe, expect, it } from "vitest";
import { listDecoder, reader, recordDecoder } from "./decode";

describe("reader", () => {
  const r = reader({ s: "x", n: 2, b: true, e: "a", o: { k: "v" }, l: [{ k: "1" }], sl: ["a", "b"], nil: null, inf: Infinity }, "thing");

  it("reads fields by type", () => {
    expect(r.path).toBe("thing");
    expect(r.str("s")).toBe("x");
    expect(r.num("n")).toBe(2);
    expect(r.bool("b")).toBe(true);
    expect(r.oneOf("e", ["a", "b"])).toBe("a");
    expect(r.obj("o").str("k")).toBe("v");
    expect(r.list("l", (i) => i.str("k"))).toEqual(["1"]);
    expect(r.strList("sl")).toEqual(["a", "b"]);
    expect(r.raw("o")).toEqual({ k: "v" });
  });

  it("reads null and missing optional fields as null", () => {
    for (const k of ["nil", "missing"]) {
      expect(r.optStr(k)).toBeNull(); expect(r.optNum(k)).toBeNull(); expect(r.optBool(k)).toBeNull();
      expect(r.optOneOf(k, ["a"])).toBeNull(); expect(r.optObj(k)).toBeNull();
    }
    expect(r.optStr("s")).toBe("x");
    expect(r.optObj("o")?.path).toBe("thing.o");
  });

  it.each([
    [() => r.str("n"), "thing.n: expected string, got number"],
    [() => r.num("inf"), "thing.inf: expected number, got number"],
    [() => r.bool("s"), "thing.s: expected boolean, got string"],
    [() => r.oneOf("e", ["z"]), "thing.e: expected one of z, got string"],
    [() => r.obj("nil"), "thing.nil: expected an object, got null"],
    [() => r.list("o", (i) => i), "thing.o: expected array, got object"],
    [() => r.list("sl", (i) => i), "thing.sl[0]: expected an object, got string"],
    [() => r.strList("l"), "thing.l: expected array of strings, got array"],
    [() => r.optNum("s"), "thing.s: expected number, got string"],
  ])("names the field that doesn't match (%#)", (read, message) => {
    expect(read).toThrow(message);
  });

  it("rejects a non-object", () => {
    expect(() => reader([], "x")).toThrow("x: expected an object, got array");
  });
});

describe("recordDecoder / listDecoder", () => {
  const one = recordDecoder("row", (r) => ({ id: r.str("id") }));
  const many = listDecoder("rows", (r) => r.num("n"));

  it("returns the value or the first mismatch", () => {
    expect(one({ id: "a", extra: 1 })).toEqual({ ok: true, value: { id: "a" } });
    expect(one({ id: 1 })).toEqual({ ok: false, error: "row.id: expected string, got number" });
    expect(many([{ n: 1 }, { n: 2 }])).toEqual({ ok: true, value: [1, 2] });
    expect(many([{ n: 1 }, {}])).toEqual({ ok: false, error: "rows[1].n: expected number, got undefined" });
    expect(many(null)).toEqual({ ok: false, error: "rows: expected an array, got null" });
  });

  it("does not swallow bugs in the read function", () => {
    expect(() => recordDecoder("x", () => { throw new RangeError("bug"); })({})).toThrow(RangeError);
    expect(() => listDecoder("x", () => { throw new RangeError("bug"); })([{}])).toThrow(RangeError);
  });
});
