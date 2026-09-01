import { describe, expect, it } from "vitest";
import {
  classifyQuadrants,
  computeInvestigationFlags,
  isWellAbove,
  isWellBelow,
  mean,
  median,
  WELL_ABOVE_RATIO,
  WELL_BELOW_RATIO,
} from "./benchmarking";

describe("median", () => {
  it("returns null for an empty array", () => {
    expect(median([])).toBeNull();
  });

  it("returns the middle value for an odd-length array, order-independent", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("averages the two middle values for an even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("is robust to an outlier the way a mean is not", () => {
    const values = [1, 2, 3, 4, 1000];
    expect(median(values)).toBe(3);
    expect(mean(values)).toBeCloseTo(202, 0);
  });
});

describe("mean", () => {
  it("returns null for an empty array", () => {
    expect(mean([])).toBeNull();
  });

  it("averages values", () => {
    expect(mean([2, 4, 6])).toBe(4);
  });
});

describe("classifyQuadrants", () => {
  it("returns nulls and no points for an empty input", () => {
    const result = classifyQuadrants([]);
    expect(result.medianX).toBeNull();
    expect(result.medianY).toBeNull();
    expect(result.points).toEqual([]);
  });

  it("splits points into 4 quadrants around the fleet median", () => {
    // x (customers): 1, 2, 3, 4 -> median 2.5
    // y (orders):    1, 2, 3, 4 -> median 2.5
    const points = [
      { salesman_id: "a", x: 1, y: 1 }, // small portfolio, low activity
      { salesman_id: "b", x: 4, y: 1 }, // large portfolio, low activity
      { salesman_id: "c", x: 1, y: 4 }, // small portfolio, high activity
      { salesman_id: "d", x: 4, y: 4 }, // large portfolio, high activity
    ];
    const { medianX, medianY, points: classified } = classifyQuadrants(points);
    expect(medianX).toBe(2.5);
    expect(medianY).toBe(2.5);
    expect(classified.find((p) => p.salesman_id === "a")!.quadrant).toBe("small-portfolio-low-activity");
    expect(classified.find((p) => p.salesman_id === "b")!.quadrant).toBe("large-portfolio-low-activity");
    expect(classified.find((p) => p.salesman_id === "c")!.quadrant).toBe("small-portfolio-high-activity");
    expect(classified.find((p) => p.salesman_id === "d")!.quadrant).toBe("large-portfolio-high-activity");
  });

  it("puts a point exactly on the median on the high/large side of that axis", () => {
    const points = [
      { salesman_id: "a", x: 1, y: 1 },
      { salesman_id: "b", x: 2, y: 2 },
      { salesman_id: "c", x: 3, y: 3 },
    ];
    // median x=2, median y=2 -> point "b" sits exactly on both medians
    const { points: classified } = classifyQuadrants(points);
    expect(classified.find((p) => p.salesman_id === "b")!.quadrant).toBe("large-portfolio-high-activity");
  });
});

describe("isWellAbove / isWellBelow", () => {
  it("uses the shared ratio constants", () => {
    expect(WELL_ABOVE_RATIO).toBe(1.5);
    expect(WELL_BELOW_RATIO).toBe(0.75);
  });

  it("is well above only past the ratio threshold", () => {
    expect(isWellAbove(15, 10)).toBe(false); // 1.5x exactly is not > threshold
    expect(isWellAbove(15.01, 10)).toBe(true);
    expect(isWellAbove(14, 10)).toBe(false);
  });

  it("is well below only past the ratio threshold", () => {
    expect(isWellBelow(7, 10)).toBe(true);
    expect(isWellBelow(7.5, 10)).toBe(false); // exactly 0.75x is not below
    expect(isWellBelow(8, 10)).toBe(false);
  });

  it("never fabricates a comparison against a missing value", () => {
    expect(isWellAbove(null, 10)).toBe(false);
    expect(isWellAbove(15, null)).toBe(false);
    expect(isWellBelow(null, 10)).toBe(false);
    expect(isWellBelow(7, null)).toBe(false);
  });

  it("treats a zero or negative fleet average as not comparable", () => {
    expect(isWellAbove(5, 0)).toBe(false);
    expect(isWellBelow(0, 0)).toBe(false);
  });
});

describe("computeInvestigationFlags", () => {
  const fleetAverage = {
    order_count: 10,
    customer_count: 10,
    rejection_rate: 0.1,
    median_turnaround_seconds: 3600,
  };

  it("flags nothing when everything is close to the fleet average", () => {
    const flags = computeInvestigationFlags({
      order_count: 10,
      customer_count: 10,
      rejection_rate: 0.1,
      median_turnaround_seconds: 3600,
      fleet_average: fleetAverage,
    });
    expect(flags).toEqual([]);
  });

  it("flags large portfolio + low activity", () => {
    const flags = computeInvestigationFlags({
      order_count: 5, // < 0.75 * 10
      customer_count: 20, // > 1.5 * 10
      rejection_rate: 0.1,
      median_turnaround_seconds: 3600,
      fleet_average: fleetAverage,
    });
    expect(flags.map((f) => f.id)).toContain("large-portfolio-low-activity");
    expect(flags.find((f) => f.id === "large-portfolio-low-activity")!.label).toMatch(/^Investigate:/);
  });

  it("flags high activity + small portfolio", () => {
    const flags = computeInvestigationFlags({
      order_count: 20, // > 1.5 * 10
      customer_count: 5, // < 0.75 * 10
      rejection_rate: 0.1,
      median_turnaround_seconds: 3600,
      fleet_average: fleetAverage,
    });
    expect(flags.map((f) => f.id)).toContain("high-activity-small-portfolio");
  });

  it("flags high rejection rate", () => {
    const flags = computeInvestigationFlags({
      order_count: 10,
      customer_count: 10,
      rejection_rate: 0.2, // > 1.5 * 0.1
      median_turnaround_seconds: 3600,
      fleet_average: fleetAverage,
    });
    expect(flags.map((f) => f.id)).toContain("high-rejection-rate");
  });

  it("flags high turnaround", () => {
    const flags = computeInvestigationFlags({
      order_count: 10,
      customer_count: 10,
      rejection_rate: 0.1,
      median_turnaround_seconds: 10000, // > 1.5 * 3600
      fleet_average: fleetAverage,
    });
    expect(flags.map((f) => f.id)).toContain("high-turnaround");
  });

  it("never computes a flag when the salesman's own value is null", () => {
    const flags = computeInvestigationFlags({
      order_count: null,
      customer_count: null,
      rejection_rate: null,
      median_turnaround_seconds: null,
      fleet_average: fleetAverage,
    });
    expect(flags).toEqual([]);
  });

  it("never computes a flag when the fleet average is null (no data yet)", () => {
    const flags = computeInvestigationFlags({
      order_count: 20,
      customer_count: 5,
      rejection_rate: 0.2,
      median_turnaround_seconds: 10000,
      fleet_average: {
        order_count: null,
        customer_count: null,
        rejection_rate: null,
        median_turnaround_seconds: null,
      },
    });
    expect(flags).toEqual([]);
  });

  it("can raise more than one flag at once", () => {
    const flags = computeInvestigationFlags({
      order_count: 5,
      customer_count: 20,
      rejection_rate: 0.2,
      median_turnaround_seconds: 10000,
      fleet_average: fleetAverage,
    });
    expect(flags.length).toBe(3); // large-portfolio-low-activity, high-rejection-rate, high-turnaround
  });
});
