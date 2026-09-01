import { describe, expect, it } from "vitest";
import { classifyActivity, computeIntervalStats, detectSignals, type OrderHistoryPoint } from "../src/lib/customerActivity.js";

const NOW = new Date("2026-09-01T00:00:00Z");

function history(...pairs: [string, number][]): OrderHistoryPoint[] {
  return pairs.map(([committedAt, itemQuantity]) => ({ committedAt, itemQuantity }));
}

describe("classifyActivity", () => {
  it("returns Insufficient Data for zero orders", () => {
    expect(classifyActivity([], NOW)).toBe("Insufficient Data");
  });

  it("returns New for exactly one order, regardless of age", () => {
    expect(classifyActivity(history(["2020-01-01", 5]), NOW)).toBe("New");
  });

  it("returns Stable when the most recent gap matches the historical baseline", () => {
    // Three orders, 30 days apart each - baseline (first gap) == recent gap.
    const h = history(["2026-07-01", 5], ["2026-07-31", 5], ["2026-08-30", 5]);
    expect(classifyActivity(h, NOW)).toBe("Stable");
  });

  it("returns Active when the most recent gap is much shorter than baseline", () => {
    // Baseline gap 40 days, then a 10-day recent gap (<=0.75x baseline).
    const h = history(["2026-06-01", 5], ["2026-07-11", 5], ["2026-07-21", 5]);
    expect(classifyActivity(h, NOW)).toBe("Active");
  });

  it("returns Declining when the most recent gap is much longer than baseline", () => {
    // Baseline gap 10 days, then a 40-day recent gap (>1.5x baseline).
    const h = history(["2026-07-01", 5], ["2026-07-11", 5], ["2026-08-20", 5]);
    expect(classifyActivity(h, NOW)).toBe("Declining");
  });

  it("returns Dormant when nothing has been ordered in far longer than the baseline gap", () => {
    // Baseline gap 15 days; nothing since 2026-01-01 (>> 3x15 and >90d before NOW).
    const h = history(["2025-12-01", 5], ["2025-12-16", 5], ["2026-01-01", 5]);
    expect(classifyActivity(h, NOW)).toBe("Dormant");
  });
});

describe("computeIntervalStats", () => {
  it("reports null intervals for fewer than 2 orders", () => {
    expect(computeIntervalStats([], NOW).avgIntervalDays).toBeNull();
    expect(computeIntervalStats(history(["2026-01-01", 1]), NOW).avgIntervalDays).toBeNull();
  });

  it("computes avg/median/recent/longest gap and active-days span correctly", () => {
    const h = history(["2026-01-01", 1], ["2026-01-11", 1], ["2026-02-10", 1]);
    const stats = computeIntervalStats(h, NOW);
    expect(stats.orderCount).toBe(3);
    expect(stats.avgIntervalDays).toBeCloseTo((10 + 30) / 2, 5);
    expect(stats.recentIntervalDays).toBeCloseTo(30, 5);
    expect(stats.longestGapDays).toBeCloseTo(30, 5);
    expect(stats.activeDays).toBeCloseTo(40, 5);
  });
});

describe("detectSignals", () => {
  it("flags a long gap using the same threshold as Dormant classification", () => {
    const h = history(["2025-12-01", 5], ["2025-12-16", 5], ["2026-01-01", 5]);
    const signals = detectSignals(h, NOW);
    expect(signals.some((s) => s.type === "long_gap")).toBe(true);
  });

  it("flags a quantity spike relative to the customer's own prior average", () => {
    const h = history(["2026-01-01", 5], ["2026-01-11", 5], ["2026-01-21", 5], ["2026-01-31", 50]);
    const signals = detectSignals(h, new Date("2026-02-01"));
    const anomaly = signals.find((s) => s.type === "quantity_anomaly");
    expect(anomaly).toBeDefined();
    if (anomaly?.type === "quantity_anomaly") {
      expect(anomaly.ratio).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not flag a quantity anomaly when volume is consistent", () => {
    const h = history(["2026-01-01", 5], ["2026-01-11", 6], ["2026-01-21", 5], ["2026-01-31", 5]);
    const signals = detectSignals(h, new Date("2026-02-01"));
    expect(signals.some((s) => s.type === "quantity_anomaly")).toBe(false);
  });

  it("needs at least 3 orders before evaluating a quantity anomaly", () => {
    const h = history(["2026-01-01", 5], ["2026-01-31", 50]);
    const signals = detectSignals(h, new Date("2026-02-01"));
    expect(signals.some((s) => s.type === "quantity_anomaly")).toBe(false);
  });
});
