import { describe, expect, it } from "vitest";
import {
  BACKLOG_SKEW_SHARE_THRESHOLD,
  REJECTION_BASELINE_RATIO,
  TURNAROUND_TAIL_RATIO,
  computeOperationalPressureFlags,
  detectBacklogSkew,
  detectRejectionAboveBaseline,
  detectTurnaroundTail,
} from "./operationalPressure";

describe("detectBacklogSkew", () => {
  it("returns null when the backlog is empty", () => {
    expect(detectBacklogSkew({ "<5m": 0, "5-10m": 0, "10-30m": 0, "30-60m": 0, "60m+": 0 }, 0)).toBeNull();
  });

  it("returns null when the two oldest buckets are at or below the threshold share", () => {
    // oldest two ("30-60m","60m+") = 5/10 = 0.5, not > threshold
    const buckets = { "<5m": 3, "5-10m": 2, "10-30m": 0, "30-60m": 3, "60m+": 2 };
    expect(detectBacklogSkew(buckets, 10)).toBeNull();
  });

  it("flags when a majority of the backlog sits in the two oldest buckets", () => {
    const buckets = { "<5m": 1, "5-10m": 1, "10-30m": 1, "30-60m": 4, "60m+": 3 };
    const signal = detectBacklogSkew(buckets, 10);
    expect(signal).not.toBeNull();
    expect(signal!.oldestBucketsShare).toBeCloseTo(0.7);
    expect(signal!.oldestBucketKeys).toEqual(["30-60m", "60m+"]);
  });

  it("does not guess when fewer than two recognized bucket keys are present", () => {
    expect(detectBacklogSkew({ "60m+": 10 }, 10)).toBeNull();
  });

  it("uses BACKLOG_SKEW_SHARE_THRESHOLD as the exact cutoff (share must exceed it, not equal it)", () => {
    expect(BACKLOG_SKEW_SHARE_THRESHOLD).toBe(0.5);
  });
});

describe("detectTurnaroundTail", () => {
  it("returns null when either value is null", () => {
    expect(detectTurnaroundTail(null, 100)).toBeNull();
    expect(detectTurnaroundTail(400, null)).toBeNull();
  });

  it("returns null when the median is zero or negative", () => {
    expect(detectTurnaroundTail(400, 0)).toBeNull();
  });

  it("returns null when p90 is at or below the ratio threshold", () => {
    expect(detectTurnaroundTail(300, 100)).toBeNull(); // exactly 3x, not > threshold
  });

  it("flags a widening tail past the ratio threshold", () => {
    const signal = detectTurnaroundTail(301, 100);
    expect(signal).not.toBeNull();
    expect(signal!.ratio).toBeCloseTo(3.01);
  });

  it("uses TURNAROUND_TAIL_RATIO as the documented threshold", () => {
    expect(TURNAROUND_TAIL_RATIO).toBe(3);
  });
});

describe("detectRejectionAboveBaseline", () => {
  it("returns null when either rate is null (the common case - previous_period_rejection_rate is usually null)", () => {
    expect(detectRejectionAboveBaseline(0.5, null)).toBeNull();
    expect(detectRejectionAboveBaseline(null, 0.2)).toBeNull();
  });

  it("returns null when the previous rate is zero or negative", () => {
    expect(detectRejectionAboveBaseline(0.1, 0)).toBeNull();
  });

  it("returns null when current is at or below the baseline ratio", () => {
    expect(detectRejectionAboveBaseline(0.3, 0.2)).toBeNull(); // exactly 1.5x, not > threshold
  });

  it("flags when current rate exceeds 1.5x the previous-period baseline", () => {
    const signal = detectRejectionAboveBaseline(0.31, 0.2);
    expect(signal).not.toBeNull();
    expect(signal!.ratio).toBeCloseTo(1.55);
  });

  it("uses REJECTION_BASELINE_RATIO as the documented threshold", () => {
    expect(REJECTION_BASELINE_RATIO).toBe(1.5);
  });
});

describe("computeOperationalPressureFlags", () => {
  it("returns no flags when nothing crosses a threshold", () => {
    const flags = computeOperationalPressureFlags({
      ageBuckets: { "<5m": 5, "5-10m": 5, "10-30m": 0, "30-60m": 0, "60m+": 0 },
      backlogTotal: 10,
      p90Seconds: 200,
      medianSeconds: 100,
      currentRejectionRate: 0.1,
      previousPeriodRejectionRate: null,
    });
    expect(flags).toEqual([]);
  });

  it("can raise multiple flags at once, each labeled as an investigation prompt", () => {
    const flags = computeOperationalPressureFlags({
      ageBuckets: { "<5m": 0, "5-10m": 0, "10-30m": 0, "30-60m": 4, "60m+": 6 },
      backlogTotal: 10,
      p90Seconds: 400,
      medianSeconds: 100,
      currentRejectionRate: 0.4,
      previousPeriodRejectionRate: 0.2,
    });
    expect(flags.length).toBe(3);
    for (const f of flags) {
      expect(f.label).toMatch(/^Investigate:/);
    }
    expect(flags.map((f) => f.signal.type).sort()).toEqual(
      ["backlog_skew", "rejection_above_baseline", "turnaround_tail"].sort(),
    );
  });

  it("never claims a cause - every label describes an observation, not a reason", () => {
    const flags = computeOperationalPressureFlags({
      ageBuckets: { "<5m": 0, "5-10m": 0, "10-30m": 0, "30-60m": 0, "60m+": 10 },
      backlogTotal: 10,
      p90Seconds: null,
      medianSeconds: null,
      currentRejectionRate: null,
      previousPeriodRejectionRate: null,
    });
    expect(flags.length).toBe(1);
    expect(flags[0].label).not.toMatch(/because|caused by|due to/i);
  });
});
