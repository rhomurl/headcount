import { describe, expect, it } from "vitest";
import { DECIMALS, toBase, toUi } from "../lib/money";

describe("six decimal money", () => {
  it("converts exact decimal UI values without floating point multiplication", () => {
    expect(DECIMALS).toBe(6);
    expect(toBase(5)).toBe(5_000_000n);
    expect(toBase(1.000001)).toBe(1_000_001n);
    expect(toBase(0.000001)).toBe(1n);
    expect(toBase(0)).toBe(0n);
    expect(toUi(5_123_456n)).toBe(5.123456);
  });
  it.each([NaN, Infinity, -Infinity, -1, 0.0000001, 1.0000001, Number.MAX_SAFE_INTEGER])("rejects invalid UI money %s", (value) => {
    expect(() => toBase(value)).toThrow();
  });
  it("rejects unsafe or negative base units at the JSON boundary", () => {
    expect(() => toUi(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow();
    expect(() => toUi(-1n)).toThrow();
    expect(toUi(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER / 1e6);
  });
});
