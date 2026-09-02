// Phase 15 (Ask VeNdO Intelligence) - unit tests for askEngine.ts's
// closed-world intent validator (parseAskIntent) and Gemini-JSON parsing
// (parseGeminiJson). No Gemini call, no app, no network - these test the
// pure validation logic directly, per the phase's own requirement that
// "the intent validation genuinely rejects an out-of-enum value" be
// tested against the validator function itself, not just end-to-end.
import { describe, expect, it } from "vitest";
import { parseAskIntent, parseGeminiJson } from "../src/lib/askEngine.js";

describe("parseAskIntent", () => {
  it("accepts a fully-specified salesman_ranking intent unchanged", () => {
    const raw = { type: "salesman_ranking", metric: "order_count", sort: "desc", limit: 5, timeframe: "current_month" };
    expect(parseAskIntent(raw)).toEqual(raw);
  });

  it("fills in defaults for an under-specified but valid salesman_ranking intent", () => {
    const result = parseAskIntent({ type: "salesman_ranking", metric: "rejection_rate" });
    expect(result).toEqual({
      type: "salesman_ranking",
      metric: "rejection_rate",
      sort: "desc",
      limit: 5,
      timeframe: "all_time",
    });
  });

  it("accepts each of the five non-unsupported shapes", () => {
    expect(parseAskIntent({ type: "insight_lookup", category: "Customer" })).toEqual({
      type: "insight_lookup",
      category: "Customer",
    });
    expect(parseAskIntent({ type: "ai_quality_summary" })).toEqual({ type: "ai_quality_summary" });
    expect(parseAskIntent({ type: "operations_summary" })).toEqual({ type: "operations_summary" });
    expect(parseAskIntent({ type: "data_health_summary" })).toEqual({ type: "data_health_summary" });
  });

  it("passes through a well-formed unsupported classification", () => {
    const raw = { type: "unsupported", reason: "This asks about revenue, which this platform does not track." };
    expect(parseAskIntent(raw)).toEqual(raw);
  });

  // The safety-critical case: an out-of-enum metric value (e.g. Gemini
  // trying to invent a "revenue" ranking metric) is genuinely rejected by
  // the validator itself, never silently coerced or passed through.
  it("rejects an out-of-enum salesman_ranking metric (e.g. a financial metric) as unsupported", () => {
    const result = parseAskIntent({ type: "salesman_ranking", metric: "revenue", sort: "desc", limit: 5 });
    expect(result.type).toBe("unsupported");
  });

  it("rejects an out-of-enum insight_lookup category as unsupported", () => {
    const result = parseAskIntent({ type: "insight_lookup", category: "Finance" });
    expect(result.type).toBe("unsupported");
  });

  it("rejects a type outside the closed enum entirely as unsupported", () => {
    const result = parseAskIntent({ type: "run_arbitrary_query", sql: "SELECT * FROM orders" });
    expect(result.type).toBe("unsupported");
  });

  it("rejects a salesman_ranking payload carrying an extra, unrecognized field (strict schema)", () => {
    const result = parseAskIntent({
      type: "salesman_ranking",
      metric: "order_count",
      sort: "desc",
      limit: 5,
      revenue_hint: 999,
    });
    expect(result.type).toBe("unsupported");
  });

  it("rejects an out-of-range limit as unsupported", () => {
    const result = parseAskIntent({ type: "salesman_ranking", metric: "order_count", limit: 500 });
    expect(result.type).toBe("unsupported");
  });

  it.each([null, undefined, "a plain string", 42, [], {}, { type: "salesman_ranking" }])(
    "treats malformed/non-matching input %p as unsupported without throwing",
    (raw) => {
      expect(() => parseAskIntent(raw)).not.toThrow();
      expect(parseAskIntent(raw).type).toBe("unsupported");
    },
  );
});

describe("parseGeminiJson", () => {
  it("parses a plain JSON object", () => {
    expect(parseGeminiJson('{"type":"ai_quality_summary"}')).toEqual({ type: "ai_quality_summary" });
  });

  it("strips a ```json fenced response before parsing", () => {
    const text = '```json\n{"type":"operations_summary"}\n```';
    expect(parseGeminiJson(text)).toEqual({ type: "operations_summary" });
  });

  it("strips a bare ``` fenced response before parsing", () => {
    const text = '```\n{"type":"data_health_summary"}\n```';
    expect(parseGeminiJson(text)).toEqual({ type: "data_health_summary" });
  });

  it("extracts an embedded JSON object from surrounding prose as a fallback", () => {
    const text = 'Sure, here you go: {"type":"ai_quality_summary"} - hope that helps!';
    expect(parseGeminiJson(text)).toEqual({ type: "ai_quality_summary" });
  });

  it("returns undefined (never throws) for text with no JSON at all", () => {
    expect(() => parseGeminiJson("I'm not sure how to answer that.")).not.toThrow();
    expect(parseGeminiJson("I'm not sure how to answer that.")).toBeUndefined();
  });
});
