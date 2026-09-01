import { describe, expect, it } from "vitest";
import {
  CONCENTRATION_SHARE_THRESHOLD,
  detectConcentratedCustomerSignal,
  detectHighFrequencyLowQuantitySignal,
  detectLowPenetrationSignal,
  detectQuantityTrendSignal,
  QUANTITY_DECLINE_RATIO,
  QUANTITY_SPIKE_RATIO,
} from "./itemSignals";

describe("detectQuantityTrendSignal", () => {
  it("returns null with fewer than 3 points", () => {
    expect(detectQuantityTrendSignal([])).toBeNull();
    expect(detectQuantityTrendSignal([{ bucket: "2026-01", value: 10 }])).toBeNull();
    expect(
      detectQuantityTrendSignal([
        { bucket: "2026-01", value: 10 },
        { bucket: "2026-02", value: 100 },
      ]),
    ).toBeNull();
  });

  it("uses the documented spike/decline ratio thresholds", () => {
    expect(QUANTITY_SPIKE_RATIO).toBe(2);
    expect(QUANTITY_DECLINE_RATIO).toBe(0.5);
  });

  it("flags a spike when the most recent month is >=2x the prior average", () => {
    const points = [
      { bucket: "2026-01", value: 10 },
      { bucket: "2026-02", value: 10 },
      { bucket: "2026-03", value: 20 }, // prior avg 10, ratio 2.0
    ];
    const signal = detectQuantityTrendSignal(points);
    expect(signal).toEqual({
      type: "quantity_trend", mostRecentQuantity: 20, priorAverageQuantity: 10, ratio: 2,
    });
  });

  it("flags a decline when the most recent month is <=0.5x the prior average", () => {
    const points = [
      { bucket: "2026-01", value: 20 },
      { bucket: "2026-02", value: 20 },
      { bucket: "2026-03", value: 10 }, // prior avg 20, ratio 0.5
    ];
    const signal = detectQuantityTrendSignal(points);
    expect(signal?.ratio).toBe(0.5);
  });

  it("does not flag a mild change within the thresholds", () => {
    const points = [
      { bucket: "2026-01", value: 10 },
      { bucket: "2026-02", value: 12 },
      { bucket: "2026-03", value: 13 }, // prior avg 11, ratio ~1.18
    ];
    expect(detectQuantityTrendSignal(points)).toBeNull();
  });

  it("never divides by a zero/negative prior average", () => {
    const points = [
      { bucket: "2026-01", value: 0 },
      { bucket: "2026-02", value: 0 },
      { bucket: "2026-03", value: 5 },
    ];
    expect(detectQuantityTrendSignal(points)).toBeNull();
  });
});

describe("detectConcentratedCustomerSignal", () => {
  it("uses the documented 50% share threshold", () => {
    expect(CONCENTRATION_SHARE_THRESHOLD).toBe(0.5);
  });

  it("returns null with no customers or a non-positive total", () => {
    expect(detectConcentratedCustomerSignal([], 100)).toBeNull();
    expect(
      detectConcentratedCustomerSignal([{ customerName: "Acme", itemQuantity: 10 }], 0),
    ).toBeNull();
  });

  it("flags when the top customer's share meets or exceeds the threshold", () => {
    const signal = detectConcentratedCustomerSignal(
      [{ customerName: "Acme", itemQuantity: 60 }, { customerName: "Beta", itemQuantity: 40 }],
      100,
    );
    expect(signal).toEqual({ type: "concentrated_customer", topCustomerName: "Acme", topCustomerShare: 0.6 });
  });

  it("flags exactly at the threshold (>=)", () => {
    const signal = detectConcentratedCustomerSignal([{ customerName: "Acme", itemQuantity: 50 }], 100);
    expect(signal?.topCustomerShare).toBe(0.5);
  });

  it("does not flag when the top customer is below the threshold", () => {
    const signal = detectConcentratedCustomerSignal(
      [{ customerName: "Acme", itemQuantity: 30 }, { customerName: "Beta", itemQuantity: 30 }],
      100,
    );
    expect(signal).toBeNull();
  });
});

describe("detectLowPenetrationSignal", () => {
  it("returns null with fewer than 3 items in the population", () => {
    expect(detectLowPenetrationSignal(2, [10, 10])).toBeNull();
  });

  it("flags when customer_count is well below the population median", () => {
    // population median = 20; 5 < 0.75 * 20
    const signal = detectLowPenetrationSignal(5, [20, 20, 20, 5]);
    expect(signal).toEqual({
      type: "low_penetration", customerCount: 5, populationMedianCustomerCount: 20, populationSize: 4,
    });
  });

  it("does not flag when customer_count is close to the median", () => {
    const signal = detectLowPenetrationSignal(18, [20, 20, 20]);
    expect(signal).toBeNull();
  });

  it("does not flag when customer_count is at or above the median", () => {
    expect(detectLowPenetrationSignal(25, [20, 20, 20])).toBeNull();
  });
});

describe("detectHighFrequencyLowQuantitySignal", () => {
  it("returns null with fewer than 3 items in the population", () => {
    expect(
      detectHighFrequencyLowQuantitySignal(
        { orderCount: 100, itemQuantity: 100 },
        [{ orderCount: 10, itemQuantity: 100 }],
      ),
    ).toBeNull();
  });

  it("flags high order_count paired with low average quantity per order", () => {
    // population: order_count median 10, avg-qty-per-order median 10
    const population = [
      { orderCount: 10, itemQuantity: 100 }, // avg 10
      { orderCount: 10, itemQuantity: 100 }, // avg 10
      { orderCount: 10, itemQuantity: 100 }, // avg 10
    ];
    // item: order_count 20 (>1.5*10), avg qty/order = 30/20=1.5 (<0.75*10)
    const signal = detectHighFrequencyLowQuantitySignal({ orderCount: 20, itemQuantity: 30 }, population);
    expect(signal).toEqual({
      type: "high_frequency_low_quantity",
      orderCount: 20,
      populationMedianOrderCount: 10,
      avgQuantityPerOrder: 1.5,
      populationMedianAvgQuantityPerOrder: 10,
      populationSize: 3,
    });
  });

  it("does not flag when only order_count is high but average quantity is normal", () => {
    const population = [
      { orderCount: 10, itemQuantity: 100 },
      { orderCount: 10, itemQuantity: 100 },
      { orderCount: 10, itemQuantity: 100 },
    ];
    const signal = detectHighFrequencyLowQuantitySignal({ orderCount: 20, itemQuantity: 200 }, population);
    expect(signal).toBeNull();
  });

  it("does not flag when only average quantity is low but order_count is normal", () => {
    const population = [
      { orderCount: 10, itemQuantity: 100 },
      { orderCount: 10, itemQuantity: 100 },
      { orderCount: 10, itemQuantity: 100 },
    ];
    const signal = detectHighFrequencyLowQuantitySignal({ orderCount: 10, itemQuantity: 5 }, population);
    expect(signal).toBeNull();
  });

  it("never divides by a zero order_count", () => {
    const population = [
      { orderCount: 10, itemQuantity: 100 },
      { orderCount: 10, itemQuantity: 100 },
      { orderCount: 10, itemQuantity: 100 },
    ];
    const signal = detectHighFrequencyLowQuantitySignal({ orderCount: 0, itemQuantity: 0 }, population);
    expect(signal).toBeNull();
  });
});
