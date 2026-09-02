import { describe, expect, it } from "vitest";
import {
  classifyBaselineDeviationSeverity,
  classifyRejectionSeverity,
  classifyCustomerGapSeverity,
  classifyQuantityAnomalySeverity,
  classifyWellAboveBelowSeverity,
  classifyDataQualityRateSeverity,
  classifyDuplicateGroupsSeverity,
  severityMax,
  insightFromAttention,
  insightFromCustomerQuantityAnomaly,
  detectItemQuantityTrendSignal,
  insightFromItemQuantityTrend,
  insightsFromSalesmanBenchmark,
  insightsFromAiQualityHotspots,
  insightsFromDataHealth,
  type AttentionInsightLike,
} from "../src/lib/insightEngine.js";

const NOW = "2026-09-01T00:00:00Z";

describe("classifyBaselineDeviationSeverity", () => {
  it("WATCH just past the 30% firing threshold up to 60%", () => {
    expect(classifyBaselineDeviationSeverity(31)).toBe("WATCH");
    expect(classifyBaselineDeviationSeverity(-31)).toBe("WATCH");
    expect(classifyBaselineDeviationSeverity(60)).toBe("WATCH");
  });
  it("WARNING strictly past 60% up to 100%", () => {
    expect(classifyBaselineDeviationSeverity(60.1)).toBe("WARNING");
    expect(classifyBaselineDeviationSeverity(100)).toBe("WARNING");
  });
  it("CRITICAL strictly past 100%", () => {
    expect(classifyBaselineDeviationSeverity(100.1)).toBe("CRITICAL");
    expect(classifyBaselineDeviationSeverity(-500)).toBe("CRITICAL");
  });
});

describe("classifyRejectionSeverity", () => {
  it("WATCH up to 2x", () => {
    expect(classifyRejectionSeverity(1.51)).toBe("WATCH");
    expect(classifyRejectionSeverity(2)).toBe("WATCH");
  });
  it("WARNING past 2x up to 3x", () => {
    expect(classifyRejectionSeverity(2.01)).toBe("WARNING");
    expect(classifyRejectionSeverity(3)).toBe("WARNING");
  });
  it("CRITICAL past 3x", () => {
    expect(classifyRejectionSeverity(3.01)).toBe("CRITICAL");
  });
});

describe("classifyCustomerGapSeverity", () => {
  it("WATCH just past the firing floor up to 2x it", () => {
    expect(classifyCustomerGapSeverity(91, 90)).toBe("WATCH");
    expect(classifyCustomerGapSeverity(180, 90)).toBe("WATCH");
  });
  it("WARNING past 2x the floor up to 4x", () => {
    expect(classifyCustomerGapSeverity(181, 90)).toBe("WARNING");
    expect(classifyCustomerGapSeverity(360, 90)).toBe("WARNING");
  });
  it("CRITICAL past 4x the floor", () => {
    expect(classifyCustomerGapSeverity(361, 90)).toBe("CRITICAL");
  });
  it("never divides by a zero/negative floor", () => {
    expect(classifyCustomerGapSeverity(100, 0)).toBe("WATCH");
  });
});

describe("classifyQuantityAnomalySeverity", () => {
  it("spike side: WATCH [2,3), WARNING [3,5), CRITICAL >=5", () => {
    expect(classifyQuantityAnomalySeverity(2)).toBe("WATCH");
    expect(classifyQuantityAnomalySeverity(2.99)).toBe("WATCH");
    expect(classifyQuantityAnomalySeverity(3)).toBe("WARNING");
    expect(classifyQuantityAnomalySeverity(4.99)).toBe("WARNING");
    expect(classifyQuantityAnomalySeverity(5)).toBe("CRITICAL");
  });
  it("decline side: WATCH (0.25,0.5], WARNING (0.1,0.25], CRITICAL <=0.1", () => {
    expect(classifyQuantityAnomalySeverity(0.5)).toBe("WATCH");
    expect(classifyQuantityAnomalySeverity(0.26)).toBe("WATCH");
    expect(classifyQuantityAnomalySeverity(0.25)).toBe("WARNING");
    expect(classifyQuantityAnomalySeverity(0.11)).toBe("WARNING");
    expect(classifyQuantityAnomalySeverity(0.1)).toBe("CRITICAL");
  });
});

describe("classifyWellAboveBelowSeverity", () => {
  it("above: WATCH (1.5,2], WARNING (2,3], CRITICAL >3", () => {
    expect(classifyWellAboveBelowSeverity(1.51, "above")).toBe("WATCH");
    expect(classifyWellAboveBelowSeverity(2, "above")).toBe("WATCH");
    expect(classifyWellAboveBelowSeverity(2.01, "above")).toBe("WARNING");
    expect(classifyWellAboveBelowSeverity(3, "above")).toBe("WARNING");
    expect(classifyWellAboveBelowSeverity(3.01, "above")).toBe("CRITICAL");
  });
  it("below: WATCH [0.5,0.75), WARNING [0.25,0.5), CRITICAL <0.25", () => {
    expect(classifyWellAboveBelowSeverity(0.74, "below")).toBe("WATCH");
    expect(classifyWellAboveBelowSeverity(0.5, "below")).toBe("WATCH");
    expect(classifyWellAboveBelowSeverity(0.49, "below")).toBe("WARNING");
    expect(classifyWellAboveBelowSeverity(0.25, "below")).toBe("WARNING");
    expect(classifyWellAboveBelowSeverity(0.24, "below")).toBe("CRITICAL");
  });
});

describe("classifyDataQualityRateSeverity", () => {
  it("WATCH for any small nonzero rate", () => {
    expect(classifyDataQualityRateSeverity(0.01)).toBe("WATCH");
    expect(classifyDataQualityRateSeverity(1)).toBe("WATCH");
  });
  it("WARNING between 1% and 5%", () => {
    expect(classifyDataQualityRateSeverity(1.01)).toBe("WARNING");
    expect(classifyDataQualityRateSeverity(5)).toBe("WARNING");
  });
  it("CRITICAL past 5%", () => {
    expect(classifyDataQualityRateSeverity(5.01)).toBe("CRITICAL");
  });
  it("treats an unknown rate (null, zero total) as at least WATCH, never dismissed", () => {
    expect(classifyDataQualityRateSeverity(null)).toBe("WATCH");
  });
});

describe("classifyDuplicateGroupsSeverity", () => {
  it("buckets on the raw group count", () => {
    expect(classifyDuplicateGroupsSeverity(1)).toBe("WATCH");
    expect(classifyDuplicateGroupsSeverity(4)).toBe("WATCH");
    expect(classifyDuplicateGroupsSeverity(5)).toBe("WARNING");
    expect(classifyDuplicateGroupsSeverity(19)).toBe("WARNING");
    expect(classifyDuplicateGroupsSeverity(20)).toBe("CRITICAL");
  });
});

describe("severityMax", () => {
  it("returns the more severe of two severities", () => {
    expect(severityMax("WATCH", "CRITICAL")).toBe("CRITICAL");
    expect(severityMax("WARNING", "WATCH")).toBe("WARNING");
    expect(severityMax("INFO", "INFO")).toBe("INFO");
  });
});

describe("insightFromAttention", () => {
  function baseline(category: AttentionInsightLike["category"], overrides: Partial<AttentionInsightLike> = {}): AttentionInsightLike {
    return {
      category,
      reason: "Investigate: something happened.",
      current_value: 15,
      baseline_value: 10,
      difference_abs: 5,
      difference_pct: 50,
      sample_size: 25,
      ...overrides,
    };
  }

  it("maps order_volume and quantity to Sales, using the baseline-deviation classifier", () => {
    const orderVolume = insightFromAttention(baseline("order_volume"), NOW);
    expect(orderVolume.category).toBe("Sales");
    expect(orderVolume.severity).toBe("WATCH"); // 50% is within (30,60]
    expect(orderVolume.drill_down).toBe("/sales");
    expect(orderVolume.explanation).toBe("Investigate: something happened."); // reused verbatim, never re-worded

    const quantity = insightFromAttention(baseline("quantity"), NOW);
    expect(quantity.category).toBe("Sales");
    expect(quantity.drill_down).toBe("/sales");
  });

  it("maps request and rejection to Operations", () => {
    const request = insightFromAttention(baseline("request"), NOW);
    expect(request.category).toBe("Operations");
    expect(request.drill_down).toBe("/operations");

    const rejection = insightFromAttention(
      baseline("rejection", { current_value: 0.3, baseline_value: 0.1, difference_abs: 0.2, difference_pct: 200 }),
      NOW,
    );
    expect(rejection.category).toBe("Operations");
    // ratio = 0.3/0.1 = 3 -> WARNING (2 < ratio <= 3)
    expect(rejection.severity).toBe("WARNING");
  });

  it("maps customer_ordering_gap to Customer, reconstructing the firing floor from current/baseline", () => {
    // baseline_value (customer's own avg interval) = 30 -> floor = max(3*30, 90) = 90
    // current_value (days since last order) = 200 -> ratio = 200/90 = 2.22 -> WARNING
    const gap = insightFromAttention(
      baseline("customer_ordering_gap", {
        current_value: 200, baseline_value: 30, difference_abs: 170, difference_pct: 566.7,
        subject: { cust_nb: "C1", customer_name: "Acme" },
      }),
      NOW,
    );
    expect(gap.category).toBe("Customer");
    expect(gap.severity).toBe("WARNING");
    expect(gap.drill_down).toBe("/customers/C1");
    expect(gap.affected_entity).toBe("Acme (C1)");
  });

  it("falls back to fleet-wide affected_entity and a generic drill-down with no subject", () => {
    const gap = insightFromAttention(baseline("customer_ordering_gap", { baseline_value: 30 }), NOW);
    expect(gap.affected_entity).toBe("fleet-wide");
    expect(gap.drill_down).toBe("/customers");
  });

  it("every field the phase schema requires is populated", () => {
    const insight = insightFromAttention(baseline("order_volume"), NOW);
    expect(insight.category).toBeTruthy();
    expect(insight.severity).toBeTruthy();
    expect(insight.title).toBeTruthy();
    expect(insight.explanation).toBeTruthy();
    expect(insight.metric).toBeTruthy();
    expect(typeof insight.current_value).toBe("number");
    expect(typeof insight.baseline).toBe("number");
    expect(typeof insight.change_abs).toBe("number");
    expect(typeof insight.sample_size).toBe("number");
    expect(insight.affected_entity).toBeTruthy();
    expect(insight.timestamp).toBe(NOW);
    expect(insight.drill_down).toBeTruthy();
  });
});

describe("insightFromCustomerQuantityAnomaly", () => {
  it("shapes a spike into a Customer insight with a working drill-down", () => {
    const insight = insightFromCustomerQuantityAnomaly(
      "C1", "Acme", { mostRecentQuantity: 20, priorAverageQuantity: 5, ratio: 4 }, 4, NOW,
    );
    expect(insight.category).toBe("Customer");
    expect(insight.severity).toBe("WARNING"); // ratio 4 -> [3,5) WARNING
    expect(insight.title).toMatch(/spike/i);
    expect(insight.current_value).toBe(20);
    expect(insight.baseline).toBe(5);
    expect(insight.change_abs).toBe(15);
    expect(insight.change_pct).toBeCloseTo(300, 5);
    expect(insight.sample_size).toBe(4);
    expect(insight.drill_down).toBe("/customers/C1");
  });

  it("shapes a decline distinctly from a spike", () => {
    const insight = insightFromCustomerQuantityAnomaly(
      "C2", "Beta", { mostRecentQuantity: 2, priorAverageQuantity: 10, ratio: 0.2 }, 5, NOW,
    );
    expect(insight.title).toMatch(/decline/i);
    expect(insight.severity).toBe("WARNING"); // ratio 0.2 -> (0.1,0.25] WARNING
  });
});

describe("detectItemQuantityTrendSignal", () => {
  it("needs at least 3 points", () => {
    expect(detectItemQuantityTrendSignal([{ bucket: "2026-01", value: 5 }, { bucket: "2026-02", value: 5 }])).toBeNull();
  });
  it("never fabricates a comparison against a zero prior average", () => {
    const points = [{ bucket: "2026-01", value: 0 }, { bucket: "2026-02", value: 0 }, { bucket: "2026-03", value: 10 }];
    expect(detectItemQuantityTrendSignal(points)).toBeNull();
  });
  it("fires on a spike (ratio >= 2) and reports the ratio", () => {
    const points = [{ bucket: "2026-01", value: 10 }, { bucket: "2026-02", value: 10 }, { bucket: "2026-03", value: 30 }];
    const signal = detectItemQuantityTrendSignal(points);
    expect(signal).toEqual({ mostRecent: 30, priorAverage: 10, ratio: 3 });
  });
  it("does not fire on a mild change", () => {
    const points = [{ bucket: "2026-01", value: 10 }, { bucket: "2026-02", value: 10 }, { bucket: "2026-03", value: 12 }];
    expect(detectItemQuantityTrendSignal(points)).toBeNull();
  });
});

describe("insightFromItemQuantityTrend", () => {
  it("shapes an Item insight with a /items drill-down", () => {
    const insight = insightFromItemQuantityTrend("I1", "Widget", { mostRecent: 30, priorAverage: 10, ratio: 3 }, 3, NOW);
    expect(insight.category).toBe("Item");
    expect(insight.severity).toBe("WARNING");
    expect(insight.drill_down).toBe("/items/I1");
    expect(insight.affected_entity).toBe("Widget (I1)");
    expect(insight.sample_size).toBe(3);
  });
});

describe("insightsFromSalesmanBenchmark", () => {
  const fleetAverage = { sample_size: 10, order_count: 10, customer_count: 10, rejection_rate: 0.1, median_turnaround_seconds: 3600 };

  it("returns nothing when everything is close to the fleet average", () => {
    const insights = insightsFromSalesmanBenchmark(
      { salesman_id: "sm_a", salesman_name: "Ahmed", order_count: 10, customer_count: 10, rejection_rate: 0.1, median_turnaround_seconds: 3600, fleet_average: fleetAverage },
      NOW,
    );
    expect(insights).toEqual([]);
  });

  it("flags large-portfolio-low-activity with a severity from the worse of its two ratios", () => {
    const insights = insightsFromSalesmanBenchmark(
      { salesman_id: "sm_a", salesman_name: "Ahmed", order_count: 2, customer_count: 40, rejection_rate: 0.1, median_turnaround_seconds: 3600, fleet_average: fleetAverage },
      NOW,
    );
    const flag = insights.find((i) => i.title.includes("Large customer portfolio"));
    expect(flag).toBeTruthy();
    expect(flag!.category).toBe("Sales");
    expect(flag!.drill_down).toBe("/salesmen/sm_a");
    // customer_count ratio 40/10=4 -> CRITICAL (above), order_count ratio 2/10=0.2 -> CRITICAL (below) -> max CRITICAL
    expect(flag!.severity).toBe("CRITICAL");
  });

  it("flags high-activity-small-portfolio", () => {
    const insights = insightsFromSalesmanBenchmark(
      { salesman_id: "sm_b", salesman_name: "Bilal", order_count: 40, customer_count: 2, rejection_rate: 0.1, median_turnaround_seconds: 3600, fleet_average: fleetAverage },
      NOW,
    );
    expect(insights.some((i) => i.title.includes("High order activity"))).toBe(true);
  });

  it("flags high rejection rate", () => {
    const insights = insightsFromSalesmanBenchmark(
      { salesman_id: "sm_c", salesman_name: "Cyrine", order_count: 10, customer_count: 10, rejection_rate: 0.3, median_turnaround_seconds: 3600, fleet_average: fleetAverage },
      NOW,
    );
    const flag = insights.find((i) => i.title.includes("Rejection rate"));
    expect(flag).toBeTruthy();
    expect(flag!.current_value).toBe(0.3);
    expect(flag!.baseline).toBe(0.1);
  });

  it("flags high turnaround", () => {
    const insights = insightsFromSalesmanBenchmark(
      { salesman_id: "sm_d", salesman_name: "Dana", order_count: 10, customer_count: 10, rejection_rate: 0.1, median_turnaround_seconds: 10000, fleet_average: fleetAverage },
      NOW,
    );
    expect(insights.some((i) => i.title.includes("Turnaround"))).toBe(true);
  });

  it("never flags when the salesman's own value is null", () => {
    const insights = insightsFromSalesmanBenchmark(
      { salesman_id: "sm_e", salesman_name: null, order_count: null, customer_count: null, rejection_rate: null, median_turnaround_seconds: null, fleet_average: fleetAverage },
      NOW,
    );
    expect(insights).toEqual([]);
  });
});

describe("insightsFromAiQualityHotspots", () => {
  it("never fabricates a comparison against a null or zero overall rate", () => {
    expect(insightsFromAiQualityHotspots(null, [{ item_nb: "I1", sample_size: 5, correction_rate: 0.9 }], [], NOW)).toEqual([]);
    expect(insightsFromAiQualityHotspots(0, [{ item_nb: "I1", sample_size: 5, correction_rate: 0.9 }], [], NOW)).toEqual([]);
  });

  it("flags an item well above the overall rate, skips one that isn't", () => {
    const insights = insightsFromAiQualityHotspots(
      0.2,
      [
        { item_nb: "I1", sample_size: 5, correction_rate: 0.4 }, // 2x -> well above, fires
        { item_nb: "I2", sample_size: 5, correction_rate: 0.25 }, // 1.25x -> not well above, skipped
      ],
      [],
      NOW,
    );
    expect(insights.length).toBe(1);
    expect(insights[0].affected_entity).toBe("I1");
    expect(insights[0].category).toBe("AI");
    expect(insights[0].drill_down).toBe("/items/I1");
    expect(insights[0].severity).toBe("WATCH"); // ratio exactly 2 -> WATCH
  });

  it("flags an intent hotspot with an /ai-quality drill-down", () => {
    const insights = insightsFromAiQualityHotspots(0.2, [], [{ intent: "return_order", sample_size: 5, correction_rate: 0.5 }], NOW);
    expect(insights.length).toBe(1);
    expect(insights[0].drill_down).toBe("/ai-quality");
    expect(insights[0].affected_entity).toBe("intent: return_order");
  });

  it("skips a null correction_rate rather than treating it as zero", () => {
    const insights = insightsFromAiQualityHotspots(0.2, [{ item_nb: "I1", sample_size: 5, correction_rate: null }], [], NOW);
    expect(insights).toEqual([]);
  });
});

describe("insightsFromDataHealth", () => {
  const clean = {
    total_order_details: 100, order_details_invalid_item_ref: 0,
    total_orders: 50, orders_with_no_lines: 0,
    total_customers: 100, customers_with_salesman: 100,
    duplicate_order_groups: 0,
  };

  it("returns nothing when every count is clean", () => {
    expect(insightsFromDataHealth(clean, NOW)).toEqual([]);
  });

  it("flags invalid item references with a rate-based severity and a zero baseline", () => {
    const insights = insightsFromDataHealth({ ...clean, order_details_invalid_item_ref: 1 }, NOW); // 1/100 = 1%
    const flag = insights.find((i) => i.title.includes("nonexistent item"));
    expect(flag).toBeTruthy();
    expect(flag!.category).toBe("Data Quality");
    expect(flag!.baseline).toBe(0);
    expect(flag!.current_value).toBe(1);
    expect(flag!.change_pct).toBeNull(); // never a fabricated pct against a zero baseline
    expect(flag!.drill_down).toBe("/data-health");
    expect(flag!.severity).toBe("WATCH"); // exactly 1% -> WATCH
  });

  it("flags orders with zero lines", () => {
    const insights = insightsFromDataHealth({ ...clean, orders_with_no_lines: 3 }, NOW); // 3/50 = 6% -> CRITICAL
    const flag = insights.find((i) => i.title.includes("zero order lines"));
    expect(flag).toBeTruthy();
    expect(flag!.severity).toBe("CRITICAL");
  });

  it("flags duplicate order groups using the count-based classifier", () => {
    const insights = insightsFromDataHealth({ ...clean, duplicate_order_groups: 6 }, NOW);
    const flag = insights.find((i) => i.title.includes("duplicate"));
    expect(flag).toBeTruthy();
    expect(flag!.severity).toBe("WARNING"); // 6 groups -> [5,19] WARNING
  });

  it("flags unassigned customers", () => {
    const insights = insightsFromDataHealth({ ...clean, customers_with_salesman: 60 }, NOW); // 40/100 = 40% -> CRITICAL
    const flag = insights.find((i) => i.title.includes("no salesman"));
    expect(flag).toBeTruthy();
    expect(flag!.current_value).toBe(40);
    expect(flag!.severity).toBe("CRITICAL");
  });

  it("every emitted insight has drill_down /data-health and category Data Quality", () => {
    const insights = insightsFromDataHealth(
      { total_order_details: 100, order_details_invalid_item_ref: 1, total_orders: 50, orders_with_no_lines: 1, total_customers: 100, customers_with_salesman: 90, duplicate_order_groups: 1 },
      NOW,
    );
    expect(insights.length).toBe(4);
    for (const i of insights) {
      expect(i.category).toBe("Data Quality");
      expect(i.drill_down).toBe("/data-health");
    }
  });
});
