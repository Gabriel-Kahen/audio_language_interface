import { describe, expect, it } from "vitest";

import { isIsoTimestamp, nowTimestamp, toIsoTimestamp } from "../src/index.js";

describe("time", () => {
  it("creates ISO UTC timestamps", () => {
    expect(isIsoTimestamp(nowTimestamp())).toBe(true);
    expect(isIsoTimestamp(toIsoTimestamp("2026-04-14T20:20:00Z"))).toBe(true);
  });

  it("rejects non-UTC or malformed timestamps", () => {
    expect(isIsoTimestamp("2026-04-14T20:20:00+02:00")).toBe(false);
    expect(isIsoTimestamp("not-a-date")).toBe(false);
    expect(isIsoTimestamp("2026-02-30T20:20:00Z")).toBe(false);
    expect(isIsoTimestamp("2026-04-14T24:20:00Z")).toBe(false);
  });
});
