import { describe, expect, it } from "vitest";
import { filtersToSearchParams, isEmptyFilters, searchParamsToFilters } from "./filters";

describe("filtersToSearchParams / searchParamsToFilters", () => {
  it("round-trips a full filter set", () => {
    const original = {
      date_from: "2026-01-01T00:00:00Z",
      date_to: "2026-01-31T23:59:59Z",
      salesman: "alice",
      customer: "58466",
      item: "165227",
      category: "Sanitizer",
      status: "rejected",
      intent: "add_order",
      order_source: "S",
      limit: 20,
    };
    const params = filtersToSearchParams(original);
    const roundTripped = searchParamsToFilters(params);
    expect(roundTripped).toEqual(original);
  });

  it("omits undefined/empty fields from the query string", () => {
    const params = filtersToSearchParams({ salesman: "alice", customer: "" as unknown as undefined });
    expect(params.get("salesman")).toBe("alice");
    expect(params.has("customer")).toBe(false);
    expect(params.has("date_from")).toBe(false);
  });

  it("drops an unparseable limit rather than throwing", () => {
    const params = new URLSearchParams({ limit: "not-a-number" });
    const f = searchParamsToFilters(params);
    expect(f.limit).toBeUndefined();
  });

  it("isEmptyFilters is true only when nothing is set", () => {
    expect(isEmptyFilters({})).toBe(true);
    expect(isEmptyFilters({ salesman: "alice" })).toBe(false);
  });
});
