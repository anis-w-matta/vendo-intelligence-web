import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, formatPercent, formatSeconds } from "./format";

describe("formatNumber", () => {
  it("formats a Decimal-as-string (item_quantity comes from the API this way)", () => {
    expect(formatNumber("140.000")).toBe("140");
  });
  it("formats a plain number with thousands separators", () => {
    expect(formatNumber(43283)).toBe("43,283");
  });
  it("renders null/undefined as an em dash, never a fabricated 0", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
  });
  it("renders a non-numeric string as an em dash rather than NaN", () => {
    expect(formatNumber("not-a-number")).toBe("—");
  });
});

describe("formatPercent", () => {
  it("converts a 0-1 ratio to a percentage string", () => {
    expect(formatPercent(0.35)).toBe("35.0%");
  });
  it("renders null as an em dash, distinct from 0%", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0)).toBe("0.0%");
  });
});

describe("formatSeconds", () => {
  it("picks the largest sensible unit", () => {
    expect(formatSeconds(45)).toBe("45s");
    expect(formatSeconds(311)).toBe("5m");
    expect(formatSeconds(4565)).toBe("1.3h");
    expect(formatSeconds(90000)).toBe("1.0d");
  });
  it("renders null as an em dash", () => {
    expect(formatSeconds(null)).toBe("—");
  });
});

describe("formatDate", () => {
  it("renders null/invalid input as an em dash rather than 'Invalid Date'", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
  it("formats a real ISO date", () => {
    expect(formatDate("2026-08-26T11:19:31.050330+03:00")).toContain("2026");
  });
});
