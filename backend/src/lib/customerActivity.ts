// Phase 8 (Customer Intelligence): activity-state classification and
// evidence-based signals computed from one customer's real order history
// (catalogClient.getCustomerOrderHistory - committed orders only, oldest
// first). This is presentation-layer classification, not an authoritative
// VeNdO business metric - the formulas are defined here, once, precisely
// so every caller gets the same answer and the thresholds are testable.
// Never predicts future behavior; every state/signal is a description of
// what already happened, phrased for investigation ("Investigate..."),
// never a verdict.
export interface OrderHistoryPoint {
  committedAt: string; // ISO
  itemQuantity: number;
}

export type ActivityState = "New" | "Active" | "Stable" | "Declining" | "Dormant" | "Insufficient Data";

export interface IntervalStats {
  orderCount: number;
  avgIntervalDays: number | null;
  medianIntervalDays: number | null;
  recentIntervalDays: number | null;
  longestGapDays: number | null;
  activeDays: number | null; // span from first to last order
  daysSinceLastOrder: number | null;
}

export interface QuantityAnomalySignal {
  type: "quantity_anomaly";
  mostRecentQuantity: number;
  priorAverageQuantity: number;
  ratio: number; // mostRecent / priorAverage
}

export interface LongGapSignal {
  type: "long_gap";
  daysSinceLastOrder: number;
  baselineIntervalDays: number;
}

export type ActivitySignal = QuantityAnomalySignal | LongGapSignal;

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeIntervalStats(history: OrderHistoryPoint[], now: Date = new Date()): IntervalStats {
  const orderCount = history.length;
  if (orderCount === 0) {
    return {
      orderCount, avgIntervalDays: null, medianIntervalDays: null, recentIntervalDays: null,
      longestGapDays: null, activeDays: null, daysSinceLastOrder: null,
    };
  }
  const last = history[history.length - 1];
  const daysSinceLastOrder = daysBetween(last.committedAt, now.toISOString());
  if (orderCount === 1) {
    return {
      orderCount, avgIntervalDays: null, medianIntervalDays: null, recentIntervalDays: null,
      longestGapDays: null, activeDays: 0, daysSinceLastOrder,
    };
  }
  const intervals: number[] = [];
  for (let i = 1; i < history.length; i++) {
    intervals.push(daysBetween(history[i - 1].committedAt, history[i].committedAt));
  }
  return {
    orderCount,
    avgIntervalDays: mean(intervals),
    medianIntervalDays: median(intervals),
    recentIntervalDays: intervals[intervals.length - 1],
    longestGapDays: Math.max(...intervals),
    activeDays: daysBetween(history[0].committedAt, last.committedAt),
    daysSinceLastOrder,
  };
}

// Baseline interval a customer's *most recent* gap is judged against: the
// average of every interval before the last one, or - with only two orders
// total, so there is only one interval - that single interval itself.
function baselineIntervalDays(history: OrderHistoryPoint[]): number {
  const intervals: number[] = [];
  for (let i = 1; i < history.length; i++) {
    intervals.push(daysBetween(history[i - 1].committedAt, history[i].committedAt));
  }
  return intervals.length > 1 ? mean(intervals.slice(0, -1)) : intervals[0];
}

// Classification thresholds (documented here, not derived from any VeNdO
// spec - a local definition for this view alone):
// - Dormant: no order in longer than max(3x their own baseline gap, 90 days)
// - Declining: most recent gap > 1.5x baseline
// - Active: most recent gap <= 0.75x baseline
// - Stable: everything else (recent gap within ~0.75x-1.5x of baseline)
export function classifyActivity(history: OrderHistoryPoint[], now: Date = new Date()): ActivityState {
  if (history.length === 0) return "Insufficient Data";
  if (history.length === 1) return "New";

  const stats = computeIntervalStats(history, now);
  const baseline = baselineIntervalDays(history);
  if (baseline <= 0 || stats.daysSinceLastOrder === null || stats.recentIntervalDays === null) {
    return "Insufficient Data";
  }

  if (stats.daysSinceLastOrder > Math.max(3 * baseline, 90)) return "Dormant";
  if (stats.recentIntervalDays > 1.5 * baseline) return "Declining";
  if (stats.recentIntervalDays <= 0.75 * baseline) return "Active";
  return "Stable";
}

// Evidence-based signals, not verdicts - the caller should render these as
// "Investigate: ..." prompts, never as a conclusion about the customer.
export function detectSignals(history: OrderHistoryPoint[], now: Date = new Date()): ActivitySignal[] {
  const signals: ActivitySignal[] = [];
  if (history.length >= 2) {
    const baseline = baselineIntervalDays(history);
    const stats = computeIntervalStats(history, now);
    if (baseline > 0 && stats.daysSinceLastOrder !== null &&
      stats.daysSinceLastOrder > Math.max(3 * baseline, 90)) {
      signals.push({ type: "long_gap", daysSinceLastOrder: Math.round(stats.daysSinceLastOrder), baselineIntervalDays: Math.round(baseline) });
    }
  }
  if (history.length >= 3) {
    const priorOrders = history.slice(0, -1);
    const priorAvg = mean(priorOrders.map((o) => o.itemQuantity));
    const mostRecent = history[history.length - 1].itemQuantity;
    if (priorAvg > 0) {
      const ratio = mostRecent / priorAvg;
      if (ratio >= 2 || ratio <= 0.5) {
        signals.push({ type: "quantity_anomaly", mostRecentQuantity: mostRecent, priorAverageQuantity: priorAvg, ratio });
      }
    }
  }
  return signals;
}
