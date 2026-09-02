// Phase 13 (Insight Engine): reshapes the evidence-backed signals Phases
// 7/8/9/11/12/16 already compute into one unified `Insight` shape, plus a
// severity classification. This module never recomputes a detection rule -
// every function here either (a) relabels fields a source module already
// produced (see insightFromAttention below, built entirely from
// backend/src/routes/overview.ts's AttentionInsight - itself Phase 12's
// tested anomalyBaseline.ts/customerActivity.ts arithmetic), or (b) is a
// small, local port of a *frontend*-only pure module's math, duplicated
// here for the same reason overview.ts already duplicates
// frontend/src/lib/anomalyBaseline.ts: a backend route and a frontend/src/
// lib module are separate TypeScript projects/module graphs and cannot
// import each other (see overview.ts's own note on this). Every ported
// constant below is commented with the frontend file/constant it mirrors,
// so the two can never silently drift without both comments being wrong.
//
// This phase's own explicit rule: "Never generate an insight without
// evidence, a baseline, a calculation, and sufficient sample size." Every
// Insight this module returns carries all of those - see the Insight
// interface below - and every classifier only runs on a signal that a
// source module already gated on its own minimum sample size /
// statistical threshold before ever reaching here.
//
// Severity is always derived from the SAME deviation magnitude the source
// signal already computed - never a separate, independent judgment call.
// Every classify* function below documents its exact thresholds, and
// every threshold is expressed as "how far past the source signal's own
// firing threshold" the observed magnitude is - e.g. anomalyBaseline.ts's
// fleet baseline deviation only ever fires past +-30%; this module then
// buckets that same magnitude into WATCH/WARNING/CRITICAL. None of the
// classifiers below ever return "INFO" - every source signal reaching this
// module has already cleared a real investigation-worthy threshold in its
// own detector, so nothing here is merely informational. INFO is defined
// on the type for schema completeness (see the phase's required severity
// enum) but this pass never fabricates a signal weak enough to deserve it.

export type InsightCategory = "Sales" | "Customer" | "Item" | "Operations" | "AI" | "Data Quality";
export type InsightSeverity = "INFO" | "WATCH" | "WARNING" | "CRITICAL";

export interface Insight {
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  explanation: string;
  metric: string;
  current_value: number;
  baseline: number;
  change_abs: number;
  change_pct: number | null; // null only when a percentage against a zero/undefined baseline would not be meaningful (never fabricated - same discipline as anomalyBaseline.ts's own baselineValue <= 0 guard)
  sample_size: number;
  affected_entity: string; // "<name> (<id>)" for a specific salesman/customer/item, or "fleet-wide" for an aggregate signal
  timestamp: string; // ISO - when this insight was generated
  drill_down: string; // relative URL into this app
}

const SEVERITY_RANK: Record<InsightSeverity, number> = { INFO: 0, WATCH: 1, WARNING: 2, CRITICAL: 3 };

export function severityMax(a: InsightSeverity, b: InsightSeverity): InsightSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

// ---------------------------------------------------------------------
// Severity classifiers - one per source signal shape, each documented
// with its exact thresholds and the firing boundary of the detector that
// feeds it.
// ---------------------------------------------------------------------

// Feeds: fleet order-volume / fleet item-quantity / request-volume
// baseline-deviation signals (Phase 12, anomalyBaseline.ts /
// overview.ts's fleetBaselineInsights - DEVIATION_THRESHOLD_PCT = 30).
// Those signals only exist once |differencePct| already exceeds 30%, so
// this classifier only ever needs to grade how far past that line the
// deviation sits.
//   30% < |pct| <= 60%  -> WATCH
//   60% < |pct| <= 100% -> WARNING
//   |pct| > 100%        -> CRITICAL
export function classifyBaselineDeviationSeverity(differencePct: number): InsightSeverity {
  const abs = Math.abs(differencePct);
  if (abs > 100) return "CRITICAL";
  if (abs > 60) return "WARNING";
  return "WATCH";
}

// Feeds: rejection-rate-vs-previous-period (Phase 12, overview.ts's
// rejectionInsight - REJECTION_BASELINE_RATIO = 1.5, ratio = current /
// previous). Fires only once ratio > 1.5.
//   1.5 < ratio <= 2 -> WATCH
//   2   < ratio <= 3 -> WARNING
//   ratio > 3        -> CRITICAL
export function classifyRejectionSeverity(ratio: number): InsightSeverity {
  if (ratio > 3) return "CRITICAL";
  if (ratio > 2) return "WARNING";
  return "WATCH";
}

// Feeds: customer ordering-gap (Phase 8, backend/src/lib/
// customerActivity.ts's detectSignals long_gap - fires once
// daysSinceLastOrder > max(3 * baselineIntervalDays, 90)). `firingFloorDays`
// is that exact floor, reconstructed by the caller from the same two
// numbers already on the signal (baseline_value and the 3x/90-day rule) -
// never a new number. ratio = daysSinceLastOrder / firingFloorDays is
// always > 1 once the signal has fired.
//   1 < ratio <= 2 -> WATCH
//   2 < ratio <= 4 -> WARNING
//   ratio > 4      -> CRITICAL
export function classifyCustomerGapSeverity(daysSinceLastOrder: number, firingFloorDays: number): InsightSeverity {
  if (firingFloorDays <= 0) return "WATCH";
  const ratio = daysSinceLastOrder / firingFloorDays;
  if (ratio > 4) return "CRITICAL";
  if (ratio > 2) return "WARNING";
  return "WATCH";
}

// Feeds two distinct source signals that share the exact same ratio
// construction and firing thresholds:
//  - Customer order-quantity anomaly (Phase 8, customerActivity.ts's
//    detectSignals quantity_anomaly: ratio = mostRecent / priorAverage,
//    fires at ratio >= 2 (spike) or ratio <= 0.5 (decline)).
//  - Item quantity-trend (Phase 9, frontend/src/lib/itemSignals.ts's
//    detectQuantityTrendSignal: QUANTITY_SPIKE_RATIO = 2,
//    QUANTITY_DECLINE_RATIO = 0.5 - identical values, ported below as
//    QUANTITY_ANOMALY_SPIKE_RATIO / QUANTITY_ANOMALY_DECLINE_RATIO).
// Spike side (ratio >= 2):   2 <= ratio < 3 -> WATCH, 3 <= ratio < 5 -> WARNING, ratio >= 5 -> CRITICAL
// Decline side (ratio <= 0.5): 0.25 < ratio <= 0.5 -> WATCH, 0.1 < ratio <= 0.25 -> WARNING, ratio <= 0.1 -> CRITICAL
export const QUANTITY_ANOMALY_SPIKE_RATIO = 2;
export const QUANTITY_ANOMALY_DECLINE_RATIO = 0.5;

export function classifyQuantityAnomalySeverity(ratio: number): InsightSeverity {
  if (ratio >= QUANTITY_ANOMALY_SPIKE_RATIO) {
    if (ratio >= 5) return "CRITICAL";
    if (ratio >= 3) return "WARNING";
    return "WATCH";
  }
  if (ratio <= 0.1) return "CRITICAL";
  if (ratio <= 0.25) return "WARNING";
  return "WATCH";
}

// Feeds two distinct source signals that share the exact same "well
// above/below the fleet average" convention:
//  - Per-salesman benchmarking flags (Phase 7, frontend/src/lib/
//    benchmarking.ts's isWellAbove/isWellBelow - WELL_ABOVE_RATIO = 1.5,
//    WELL_BELOW_RATIO = 0.75, ported below as SALES_WELL_ABOVE_RATIO/
//    SALES_WELL_BELOW_RATIO).
//  - AI correction-rate hotspots (Phase 11) vs. the fleet-wide overall
//    correction rate - this module reuses the identical 1.5x "well
//    above" convention rather than inventing a separate AI-specific
//    ratio, for consistency with the rest of the app.
// Above: 1.5 < ratio <= 2 -> WATCH, 2 < ratio <= 3 -> WARNING, ratio > 3 -> CRITICAL
// Below: 0.5 <= ratio < 0.75 -> WATCH, 0.25 <= ratio < 0.5 -> WARNING, ratio < 0.25 -> CRITICAL
export const SALES_WELL_ABOVE_RATIO = 1.5;
export const SALES_WELL_BELOW_RATIO = 0.75;

export function classifyWellAboveBelowSeverity(ratio: number, direction: "above" | "below"): InsightSeverity {
  if (direction === "above") {
    if (ratio > 3) return "CRITICAL";
    if (ratio > 2) return "WARNING";
    return "WATCH";
  }
  if (ratio < 0.25) return "CRITICAL";
  if (ratio < 0.5) return "WARNING";
  return "WATCH";
}

// Feeds: Data Quality rate-based findings (Phase 16, catalog-service
// data-health counts, e.g. order_details_invalid_item_ref /
// total_order_details, or unassigned customers / total customers). Per
// this phase's own guidance: "a structural Data Quality finding ... might
// always be at least WATCH since any occurrence is worth investigating" -
// so this classifier is only ever called once the raw count is already
// known to be > 0, and never returns anything below WATCH.
//   0% < pct <= 1% -> WATCH
//   1% < pct <= 5% -> WARNING
//   pct > 5%       -> CRITICAL
// pctOfTotal is null only when the denominator itself is 0 (nothing to
// divide by) - still at least WATCH, since a nonzero violation count with
// an empty population is itself worth investigating, not evidence of
// nothing.
export function classifyDataQualityRateSeverity(pctOfTotal: number | null): InsightSeverity {
  if (pctOfTotal === null) return "WATCH";
  if (pctOfTotal > 5) return "CRITICAL";
  if (pctOfTotal > 1) return "WARNING";
  return "WATCH";
}

// Feeds: duplicate_order_groups (Phase 16) - a plain count with no
// natural total to compute a rate against (it is already a narrow,
// conservative heuristic - see dataHealth.ts's own caveat). Thresholds
// here are a local, documented judgment call on the raw group count
// alone, same as every other phase's locally-defined thresholds.
//   1-4 groups   -> WATCH
//   5-19 groups  -> WARNING
//   20+ groups   -> CRITICAL
export function classifyDuplicateGroupsSeverity(groups: number): InsightSeverity {
  if (groups >= 20) return "CRITICAL";
  if (groups >= 5) return "WARNING";
  return "WATCH";
}

// ---------------------------------------------------------------------
// Shaping functions - pure reshapes of already-computed source data into
// Insight objects. None of these compute a new business number beyond
// what's needed to fill a required Insight field from numbers the source
// already exposes (e.g. `change_abs`/`change_pct` derived from a source's
// own current/baseline pair).
// ---------------------------------------------------------------------

// Mirrors backend/src/routes/overview.ts's AttentionCategory/AttentionInsight
// structurally (type-only import there - no runtime coupling to the route
// module). Covers order_volume, quantity (fleet item quantity), request,
// rejection, and customer_ordering_gap - the five Phase 12 Attention
// Center categories.
export type AttentionCategoryLike = "order_volume" | "quantity" | "request" | "rejection" | "customer_ordering_gap";

export interface AttentionInsightLike {
  category: AttentionCategoryLike;
  reason: string;
  current_value: number;
  baseline_value: number;
  difference_abs: number;
  difference_pct: number;
  sample_size: number;
  subject?: { cust_nb: string; customer_name: string };
}

const ATTENTION_CATEGORY_MAP: Record<AttentionCategoryLike, InsightCategory> = {
  order_volume: "Sales",
  quantity: "Sales",
  request: "Operations",
  rejection: "Operations",
  customer_ordering_gap: "Customer",
};

const ATTENTION_COPY: Record<AttentionCategoryLike, { title: string; metric: string }> = {
  order_volume: { title: "Unusual fleet order volume", metric: "Fleet daily order count" },
  quantity: { title: "Unusual fleet item quantity", metric: "Fleet daily item quantity" },
  request: { title: "Unusual request volume", metric: "Daily request volume" },
  rejection: { title: "Rejection rate above its previous-period baseline", metric: "Rejection rate" },
  customer_ordering_gap: { title: "Customer overdue for a reorder", metric: "Days since last order" },
};

function attentionDrillDown(a: AttentionInsightLike): string {
  switch (a.category) {
    case "order_volume":
    case "quantity":
      return "/sales";
    case "request":
    case "rejection":
      return "/operations";
    case "customer_ordering_gap":
      return a.subject ? `/customers/${encodeURIComponent(a.subject.cust_nb)}` : "/customers";
  }
}

export function insightFromAttention(a: AttentionInsightLike, nowIso: string): Insight {
  const copy = ATTENTION_COPY[a.category];
  let severity: InsightSeverity;
  if (a.category === "rejection") {
    const ratio = a.baseline_value > 0 ? a.current_value / a.baseline_value : 0;
    severity = classifyRejectionSeverity(ratio);
  } else if (a.category === "customer_ordering_gap") {
    // a.baseline_value is the customer's own average interval
    // (baselineIntervalDays); the firing floor detectSignals used is
    // max(3 * that, 90) - reconstructed here from the same two numbers
    // already on the signal, never a new one.
    const firingFloorDays = Math.max(3 * a.baseline_value, 90);
    severity = classifyCustomerGapSeverity(a.current_value, firingFloorDays);
  } else {
    severity = classifyBaselineDeviationSeverity(a.difference_pct);
  }

  return {
    category: ATTENTION_CATEGORY_MAP[a.category],
    severity,
    title: copy.title,
    explanation: a.reason, // already an "Investigate: ..." string built entirely from this same object's fields (Phase 12's own anti-drift-tested reason string) - reused verbatim, never re-worded
    metric: copy.metric,
    current_value: a.current_value,
    baseline: a.baseline_value,
    change_abs: a.difference_abs,
    change_pct: a.difference_pct,
    sample_size: a.sample_size,
    affected_entity: a.subject ? `${a.subject.customer_name} (${a.subject.cust_nb})` : "fleet-wide",
    timestamp: nowIso,
    drill_down: attentionDrillDown(a),
  };
}

// -- Customer order-quantity anomaly (Phase 8's detectSignals
// quantity_anomaly - not part of overview.ts's Attention Center, built
// here directly from the same top-customer/history data insights.ts
// already fetches for the ordering-gap signal above). --

export interface QuantityAnomalySignalLike {
  mostRecentQuantity: number;
  priorAverageQuantity: number;
  ratio: number;
}

export function insightFromCustomerQuantityAnomaly(
  custNb: string,
  customerName: string,
  signal: QuantityAnomalySignalLike,
  historyLength: number,
  nowIso: string,
): Insight {
  const severity = classifyQuantityAnomalySeverity(signal.ratio);
  const direction = signal.ratio >= QUANTITY_ANOMALY_SPIKE_RATIO ? "spike" : "decline";
  const entity = `${customerName} (${custNb})`;
  return {
    category: "Customer",
    severity,
    title: direction === "spike" ? "Customer order-quantity spike" : "Customer order-quantity decline",
    explanation:
      `Investigate: ${entity}'s most recent order quantity was ${signal.mostRecentQuantity}, ` +
      `vs. a prior average of ${signal.priorAverageQuantity.toFixed(1)} across their earlier orders ` +
      `(${signal.ratio.toFixed(2)}x) - a ${direction} worth investigating.`,
    metric: "Order item quantity (most recent vs. prior average)",
    current_value: signal.mostRecentQuantity,
    baseline: signal.priorAverageQuantity,
    change_abs: signal.mostRecentQuantity - signal.priorAverageQuantity,
    change_pct:
      signal.priorAverageQuantity > 0
        ? ((signal.mostRecentQuantity - signal.priorAverageQuantity) / signal.priorAverageQuantity) * 100
        : null,
    sample_size: historyLength,
    affected_entity: entity,
    timestamp: nowIso,
    drill_down: `/customers/${encodeURIComponent(custNb)}`,
  };
}

// -- Item quantity-trend (ported from frontend/src/lib/itemSignals.ts's
// detectQuantityTrendSignal - same >=3-point gate, same ratio math, same
// QUANTITY_SPIKE_RATIO/QUANTITY_DECLINE_RATIO=2/0.5 constants as
// QUANTITY_ANOMALY_SPIKE_RATIO/QUANTITY_ANOMALY_DECLINE_RATIO above -
// duplicated here for the frontend/backend module-graph split documented
// at the top of this file. Scoped by the caller to a bounded top-N items
// list (see insights.ts's TOP_ITEM_LIMIT) - never looped over the full
// catalogue. --

export interface ItemTrendPoint {
  bucket: string;
  value: number;
}

export interface ItemQuantityTrendSignal {
  mostRecent: number;
  priorAverage: number;
  ratio: number;
}

export function detectItemQuantityTrendSignal(points: ItemTrendPoint[]): ItemQuantityTrendSignal | null {
  if (points.length < 3) return null;
  const priorValues = points.slice(0, -1).map((p) => p.value);
  const mostRecent = points[points.length - 1].value;
  const priorAverage = priorValues.reduce((a, b) => a + b, 0) / priorValues.length;
  if (!(priorAverage > 0)) return null;
  const ratio = mostRecent / priorAverage;
  if (ratio >= QUANTITY_ANOMALY_SPIKE_RATIO || ratio <= QUANTITY_ANOMALY_DECLINE_RATIO) {
    return { mostRecent, priorAverage, ratio };
  }
  return null;
}

export function insightFromItemQuantityTrend(
  itemNb: string,
  itemDesc: string,
  signal: ItemQuantityTrendSignal,
  sampleSize: number,
  nowIso: string,
): Insight {
  const severity = classifyQuantityAnomalySeverity(signal.ratio);
  const direction = signal.ratio >= QUANTITY_ANOMALY_SPIKE_RATIO ? "spike" : "decline";
  const entity = `${itemDesc} (${itemNb})`;
  return {
    category: "Item",
    severity,
    title: direction === "spike" ? "Item order-quantity spike" : "Item order-quantity decline",
    explanation:
      `Investigate: ${entity}'s most recent monthly order quantity was ${signal.mostRecent}, ` +
      `vs. a prior monthly average of ${signal.priorAverage.toFixed(1)} across ${sampleSize} monthly trend point(s) ` +
      `(${signal.ratio.toFixed(2)}x) - a ${direction} worth investigating.`,
    metric: "Monthly item order quantity (most recent vs. prior average)",
    current_value: signal.mostRecent,
    baseline: signal.priorAverage,
    change_abs: signal.mostRecent - signal.priorAverage,
    change_pct: signal.priorAverage > 0 ? ((signal.mostRecent - signal.priorAverage) / signal.priorAverage) * 100 : null,
    sample_size: sampleSize,
    affected_entity: entity,
    timestamp: nowIso,
    drill_down: `/items/${encodeURIComponent(itemNb)}`,
  };
}

// -- Sales: per-salesman benchmarking flags (ported from frontend/src/lib/
// benchmarking.ts's computeInvestigationFlags - same 4 flags, same
// isWellAbove/isWellBelow guards (null-safe, zero/negative average is not
// comparable), duplicated here for the same module-graph split. --

function isWellAboveLocal(value: number | null, average: number | null): boolean {
  if (value === null || average === null || average <= 0) return false;
  return value > average * SALES_WELL_ABOVE_RATIO;
}

function isWellBelowLocal(value: number | null, average: number | null): boolean {
  if (value === null || average === null || average <= 0) return false;
  return value < average * SALES_WELL_BELOW_RATIO;
}

export interface SalesmanFleetAverage {
  sample_size: number;
  order_count: number | null;
  customer_count: number | null;
  rejection_rate: number | null;
  median_turnaround_seconds: number | null;
}

export interface SalesmanBenchmarkInput {
  salesman_id: string;
  salesman_name: string | null;
  order_count: number | null;
  customer_count: number | null;
  rejection_rate: number | null;
  median_turnaround_seconds: number | null;
  fleet_average: SalesmanFleetAverage;
}

export function insightsFromSalesmanBenchmark(input: SalesmanBenchmarkInput, nowIso: string): Insight[] {
  const { order_count, customer_count, rejection_rate, median_turnaround_seconds, fleet_average } = input;
  const entity = `${input.salesman_name ?? input.salesman_id} (${input.salesman_id})`;
  const drill = `/salesmen/${encodeURIComponent(input.salesman_id)}`;
  const insights: Insight[] = [];

  if (isWellAboveLocal(customer_count, fleet_average.customer_count) && isWellBelowLocal(order_count, fleet_average.order_count)) {
    const ratioAbove = customer_count! / fleet_average.customer_count!;
    const ratioBelow = order_count! / fleet_average.order_count!;
    insights.push({
      category: "Sales",
      severity: severityMax(
        classifyWellAboveBelowSeverity(ratioAbove, "above"),
        classifyWellAboveBelowSeverity(ratioBelow, "below"),
      ),
      title: "Large customer portfolio, low order activity",
      explanation:
        `Investigate: ${entity} has a customer portfolio of ${customer_count} (fleet average ` +
        `${fleet_average.customer_count!.toFixed(1)} across ${fleet_average.sample_size} active salesmen, ` +
        `${ratioAbove.toFixed(2)}x), paired with ${order_count} order(s) (fleet average ` +
        `${fleet_average.order_count!.toFixed(1)}, ${ratioBelow.toFixed(2)}x) - large portfolio paired with low order activity.`,
      metric: "Order count vs. fleet average",
      current_value: order_count!,
      baseline: fleet_average.order_count!,
      change_abs: order_count! - fleet_average.order_count!,
      change_pct: ((order_count! - fleet_average.order_count!) / fleet_average.order_count!) * 100,
      sample_size: fleet_average.sample_size,
      affected_entity: entity,
      timestamp: nowIso,
      drill_down: drill,
    });
  }

  if (isWellAboveLocal(order_count, fleet_average.order_count) && isWellBelowLocal(customer_count, fleet_average.customer_count)) {
    const ratioAbove = order_count! / fleet_average.order_count!;
    const ratioBelow = customer_count! / fleet_average.customer_count!;
    insights.push({
      category: "Sales",
      severity: severityMax(
        classifyWellAboveBelowSeverity(ratioAbove, "above"),
        classifyWellAboveBelowSeverity(ratioBelow, "below"),
      ),
      title: "High order activity, small customer portfolio",
      explanation:
        `Investigate: ${entity} has ${order_count} order(s) (fleet average ${fleet_average.order_count!.toFixed(1)}, ` +
        `${ratioAbove.toFixed(2)}x) concentrated in a customer portfolio of ${customer_count} (fleet average ` +
        `${fleet_average.customer_count!.toFixed(1)}, ${ratioBelow.toFixed(2)}x) - high activity in a small portfolio.`,
      metric: "Order count vs. fleet average",
      current_value: order_count!,
      baseline: fleet_average.order_count!,
      change_abs: order_count! - fleet_average.order_count!,
      change_pct: ((order_count! - fleet_average.order_count!) / fleet_average.order_count!) * 100,
      sample_size: fleet_average.sample_size,
      affected_entity: entity,
      timestamp: nowIso,
      drill_down: drill,
    });
  }

  if (isWellAboveLocal(rejection_rate, fleet_average.rejection_rate)) {
    const ratio = rejection_rate! / fleet_average.rejection_rate!;
    insights.push({
      category: "Sales",
      severity: classifyWellAboveBelowSeverity(ratio, "above"),
      title: "Rejection rate well above the fleet average",
      explanation:
        `Investigate: ${entity}'s rejection rate is ${(rejection_rate! * 100).toFixed(1)}%, vs. a fleet average of ` +
        `${(fleet_average.rejection_rate! * 100).toFixed(1)}% across ${fleet_average.sample_size} active salesmen (${ratio.toFixed(2)}x).`,
      metric: "Rejection rate vs. fleet average",
      current_value: rejection_rate!,
      baseline: fleet_average.rejection_rate!,
      change_abs: rejection_rate! - fleet_average.rejection_rate!,
      change_pct: (ratio - 1) * 100,
      sample_size: fleet_average.sample_size,
      affected_entity: entity,
      timestamp: nowIso,
      drill_down: drill,
    });
  }

  if (isWellAboveLocal(median_turnaround_seconds, fleet_average.median_turnaround_seconds)) {
    const ratio = median_turnaround_seconds! / fleet_average.median_turnaround_seconds!;
    insights.push({
      category: "Sales",
      severity: classifyWellAboveBelowSeverity(ratio, "above"),
      title: "Turnaround time well above the fleet average",
      explanation:
        `Investigate: ${entity}'s median turnaround is ${Math.round(median_turnaround_seconds!)}s, vs. a fleet baseline of ` +
        `${Math.round(fleet_average.median_turnaround_seconds!)}s across ${fleet_average.sample_size} active salesmen (${ratio.toFixed(2)}x).`,
      metric: "Median turnaround vs. fleet average",
      current_value: median_turnaround_seconds!,
      baseline: fleet_average.median_turnaround_seconds!,
      change_abs: median_turnaround_seconds! - fleet_average.median_turnaround_seconds!,
      change_pct: (ratio - 1) * 100,
      sample_size: fleet_average.sample_size,
      affected_entity: entity,
      timestamp: nowIso,
      drill_down: drill,
    });
  }

  return insights;
}

// -- AI: item/intent correction-rate hotspots (Phase 11) vs. the
// fleet-wide overall correction rate. Callers are expected to have
// already applied whatever minimum-sample-size gate they want (aiQuality.ts's
// by_item is already gated server-side upstream; insights.ts additionally
// applies its own local floor before calling this - see insights.ts's
// AI_MIN_SAMPLE_SIZE). This function itself never fabricates a comparison
// against a zero/unknown overall rate (same discipline as
// anomalyBaseline.ts's baselineValue <= 0 guard). --

export interface AiHotspotStat {
  sample_size: number;
  correction_rate: number | null;
}

export interface AiItemHotspot extends AiHotspotStat {
  item_nb: string;
}

export interface AiIntentHotspot extends AiHotspotStat {
  intent: string;
}

export function insightsFromAiQualityHotspots(
  overallCorrectionRate: number | null,
  byItem: AiItemHotspot[],
  byIntent: AiIntentHotspot[],
  nowIso: string,
): Insight[] {
  if (overallCorrectionRate === null || overallCorrectionRate <= 0) return [];
  const insights: Insight[] = [];

  for (const item of byItem) {
    if (item.correction_rate === null) continue;
    if (!isWellAboveLocal(item.correction_rate, overallCorrectionRate)) continue;
    const ratio = item.correction_rate / overallCorrectionRate;
    const entity = item.item_nb;
    insights.push({
      category: "AI",
      severity: classifyWellAboveBelowSeverity(ratio, "above"),
      title: "AI correction-rate hotspot on an item",
      explanation:
        `Investigate: item ${item.item_nb} has a ${(item.correction_rate * 100).toFixed(1)}% correction rate across ` +
        `${item.sample_size} reviewed line(s), vs. the fleet-wide overall correction rate of ` +
        `${(overallCorrectionRate * 100).toFixed(1)}% (${ratio.toFixed(2)}x).`,
      metric: "AI correction rate (item hotspot) vs. fleet-wide overall correction rate",
      current_value: item.correction_rate,
      baseline: overallCorrectionRate,
      change_abs: item.correction_rate - overallCorrectionRate,
      change_pct: (ratio - 1) * 100,
      sample_size: item.sample_size,
      affected_entity: entity,
      timestamp: nowIso,
      drill_down: `/items/${encodeURIComponent(item.item_nb)}`,
    });
  }

  for (const intent of byIntent) {
    if (intent.correction_rate === null) continue;
    if (!isWellAboveLocal(intent.correction_rate, overallCorrectionRate)) continue;
    const ratio = intent.correction_rate / overallCorrectionRate;
    insights.push({
      category: "AI",
      severity: classifyWellAboveBelowSeverity(ratio, "above"),
      title: "AI correction-rate hotspot on an intent",
      explanation:
        `Investigate: intent "${intent.intent}" has a ${(intent.correction_rate * 100).toFixed(1)}% correction rate ` +
        `across ${intent.sample_size} reviewed line(s), vs. the fleet-wide overall correction rate of ` +
        `${(overallCorrectionRate * 100).toFixed(1)}% (${ratio.toFixed(2)}x).`,
      metric: "AI correction rate (intent hotspot) vs. fleet-wide overall correction rate",
      current_value: intent.correction_rate,
      baseline: overallCorrectionRate,
      change_abs: intent.correction_rate - overallCorrectionRate,
      change_pct: (ratio - 1) * 100,
      sample_size: intent.sample_size,
      affected_entity: `intent: ${intent.intent}`,
      timestamp: nowIso,
      drill_down: "/ai-quality",
    });
  }

  return insights;
}

// -- Data Quality: structural completeness findings (Phase 16,
// catalog-service data-health counts). Reuses the exact same raw counts
// dataHealth.ts already computes from catalogClient.getCatalogDataHealth()
// - no new fetch shape, only a different presentation (Insight objects
// instead of the completeness-table envelope). Only ever fires when a
// count is > 0 - never pads with a "0 violations" insight (an absence of
// a Data Quality insight for a given check IS the honest signal that
// nothing was found there). --

export interface DataHealthInput {
  total_order_details: number;
  order_details_invalid_item_ref: number;
  total_orders: number;
  orders_with_no_lines: number;
  total_customers: number;
  customers_with_salesman: number;
  duplicate_order_groups: number;
}

function pctOrNull(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null;
}

export function insightsFromDataHealth(h: DataHealthInput, nowIso: string): Insight[] {
  const insights: Insight[] = [];

  if (h.order_details_invalid_item_ref > 0) {
    const pct = pctOrNull(h.order_details_invalid_item_ref, h.total_order_details);
    insights.push({
      category: "Data Quality",
      severity: classifyDataQualityRateSeverity(pct),
      title: "Order lines reference a nonexistent item",
      explanation:
        `Investigate: ${h.order_details_invalid_item_ref} of ${h.total_order_details} order_details row(s) ` +
        `(${pct !== null ? pct.toFixed(2) + "%" : "rate unknown - zero total"}) reference an item_nb no longer ` +
        `(or never) present in the catalog - most likely a discontinued/renamed item from the legacy ERP import.`,
      metric: "order_details_invalid_item_ref count",
      current_value: h.order_details_invalid_item_ref,
      baseline: 0,
      change_abs: h.order_details_invalid_item_ref,
      change_pct: null,
      sample_size: h.total_order_details,
      affected_entity: "fleet-wide",
      timestamp: nowIso,
      drill_down: "/data-health",
    });
  }

  if (h.orders_with_no_lines > 0) {
    const pct = pctOrNull(h.orders_with_no_lines, h.total_orders);
    insights.push({
      category: "Data Quality",
      severity: classifyDataQualityRateSeverity(pct),
      title: "Orders with zero order lines",
      explanation:
        `Investigate: ${h.orders_with_no_lines} of ${h.total_orders} order header(s) ` +
        `(${pct !== null ? pct.toFixed(2) + "%" : "rate unknown - zero total"}) have zero order_details rows - ` +
        `a Header vs. Details reconciliation gap.`,
      metric: "orders_with_no_lines count",
      current_value: h.orders_with_no_lines,
      baseline: 0,
      change_abs: h.orders_with_no_lines,
      change_pct: null,
      sample_size: h.total_orders,
      affected_entity: "fleet-wide",
      timestamp: nowIso,
      drill_down: "/data-health",
    });
  }

  if (h.duplicate_order_groups > 0) {
    insights.push({
      category: "Data Quality",
      severity: classifyDuplicateGroupsSeverity(h.duplicate_order_groups),
      title: "Possible duplicate orders detected",
      explanation:
        `Investigate: ${h.duplicate_order_groups} group(s) of orders share the same customer and a ` +
        `to-the-second commit timestamp - a deliberately narrow, conservative heuristic (see Data Health for the ` +
        `full caveat); expected to UNDER-count real duplicates, treat as a lower bound.`,
      metric: "duplicate_order_groups count",
      current_value: h.duplicate_order_groups,
      baseline: 0,
      change_abs: h.duplicate_order_groups,
      change_pct: null,
      sample_size: h.total_orders,
      affected_entity: "fleet-wide",
      timestamp: nowIso,
      drill_down: "/data-health",
    });
  }

  const unassigned = h.total_customers - h.customers_with_salesman;
  if (unassigned > 0) {
    const pct = pctOrNull(unassigned, h.total_customers);
    insights.push({
      category: "Data Quality",
      severity: classifyDataQualityRateSeverity(pct),
      title: "Customers with no salesman assignment",
      explanation:
        `Investigate: ${unassigned} of ${h.total_customers} customer(s) ` +
        `(${pct !== null ? pct.toFixed(2) + "%" : "rate unknown - zero total"}) have no salesman assigned - ` +
        `typically legacy ERP-imported customers with no source of truth for who sells to whom.`,
      metric: "customers with no salesman assignment",
      current_value: unassigned,
      baseline: 0,
      change_abs: unassigned,
      change_pct: null,
      sample_size: h.total_customers,
      affected_entity: "fleet-wide",
      timestamp: nowIso,
      drill_down: "/data-health",
    });
  }

  return insights;
}
