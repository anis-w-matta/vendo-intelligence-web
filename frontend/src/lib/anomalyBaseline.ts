// Phase 12 (Anomaly Detection Engine): fleet-wide baseline-deviation
// detector for a daily {bucket, value} trend series - fleet order count,
// fleet item quantity, or aggregated daily request volume, anything
// catalog-service's GET /analytics/orders-trend?granularity=day or
// backend's requests-summary volume_over_time can produce.
//
// Same discipline as every other signal module in this codebase
// (benchmarking.ts Phase 7, backend/src/lib/customerActivity.ts Phase 8,
// itemSignals.ts Phase 9, operationalPressure.ts Phase 10): pure,
// side-effect-free, every threshold documented and tested here, and every
// signal is evidence for investigation ("Investigate: ...") - never a
// verdict. Per this phase's own explicit rule ("Administrators must be
// able to understand why an anomaly was generated. Do not build an opaque
// black box."), every anomaly this module returns carries its current
// value, baseline value, both the absolute and percentage difference, the
// exact date range backing each side, the sample size behind the
// baseline, and a `reason` string built only from those numbers - never a
// bare "anomaly detected."
//
// NOTE on where this runs: backend/src/routes/overview.ts (a *different*
// npm package/module graph from this frontend - see backend/src/lib/
// customerActivity.ts vs. this file's own note below, and itemSignals.ts's
// note on the same split) needs this exact arithmetic to assemble the
// Attention Center server-side. A backend route cannot import a
// frontend/src/lib module (separate TypeScript project, separate
// `rootDir`, separate node_modules) - so overview.ts carries a small local
// duplicate of the two functions below, kept intentionally
// arithmetic-for-arithmetic equivalent to this file. That's the same
// pattern itemSignals.ts already uses for QUANTITY_SPIKE_RATIO/
// QUANTITY_DECLINE_RATIO (duplicated from customerActivity.ts with an
// identical comment there).

export interface DailyTrendPoint {
  bucket: string; // "YYYY-MM-DD"
  value: number;
}

export type BaselineWindowDays = 7 | 30;

export const BASELINE_WINDOWS: readonly BaselineWindowDays[] = [7, 30];

// Minimum number of real (parseable) data points required inside a
// baseline window before it's trusted - e.g. never compute a 30-day
// baseline off 4 days of history. Deliberately less than the full window
// length since a real trend series can have gaps (a day with zero
// activity may or may not appear as its own point, depending on the
// upstream service) - the sample size is always reported alongside the
// signal so an admin can judge it themselves rather than trusting a
// hidden assumption.
export const MIN_SAMPLE_SIZE: Record<BaselineWindowDays, number> = { 7: 5, 30: 20 };

// +-30% deviation threshold. Consistent in spirit with benchmarking.ts's
// WELL_ABOVE_RATIO/WELL_BELOW_RATIO (Phase 7, 1.5x/0.75x - i.e. +50%/-25%)
// but expressed as one symmetric percentage, since this module compares a
// single day's value against a multi-day mean rather than two population
// aggregates. Documented here, not derived from any VeNdO spec defined
// elsewhere - a local threshold for this module alone, same as every
// other phase's thresholds.
export const DEVIATION_THRESHOLD_PCT = 30;

export interface DatePeriod {
  from: string;
  to: string;
}

export interface AnomalyBaselineSignal {
  type: "baseline_deviation";
  metricLabel: string;
  windowDays: BaselineWindowDays;
  currentValue: number;
  currentPeriod: DatePeriod;
  baselineValue: number;
  baselinePeriod: DatePeriod;
  sampleSize: number;
  differenceAbs: number;
  differencePct: number;
  direction: "above" | "below";
  reason: string; // "Investigate: ..." - every number in here also appears as its own field above
}

function parseDayMs(bucket: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bucket)) return null;
  const ms = new Date(`${bucket}T00:00:00Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Compares the most recent day in `series` against the mean of the
// `windowDays` calendar days immediately preceding it. Returns null when:
//  - there are fewer than 2 parseable points (nothing to compare against)
//  - fewer than MIN_SAMPLE_SIZE[windowDays] real points fall inside the
//    baseline window (not enough history to trust a mean)
//  - the baseline mean is zero/negative (a percentage difference against
//    zero or a negative baseline is not meaningful)
//  - the deviation doesn't clear DEVIATION_THRESHOLD_PCT
// Never fabricates a comparison it can't back with real data - the same
// discipline as isWellAbove/isWellBelow in benchmarking.ts.
export function detectBaselineAnomaly(
  series: DailyTrendPoint[],
  windowDays: BaselineWindowDays,
  metricLabel: string,
): AnomalyBaselineSignal | null {
  const parsed = series
    .map((p) => ({ ms: parseDayMs(p.bucket), bucket: p.bucket, value: p.value }))
    .filter((p): p is { ms: number; bucket: string; value: number } => p.ms !== null)
    .sort((a, b) => a.ms - b.ms);
  if (parsed.length < 2) return null;

  const current = parsed[parsed.length - 1];
  const windowStartMs = current.ms - windowDays * 86_400_000;
  const windowPoints = parsed
    .slice(0, -1)
    .filter((p) => p.ms >= windowStartMs && p.ms < current.ms);

  const sampleSize = windowPoints.length;
  if (sampleSize < MIN_SAMPLE_SIZE[windowDays]) return null;

  const baselineValue = mean(windowPoints.map((p) => p.value));
  if (baselineValue === null || baselineValue <= 0) return null;

  const differenceAbs = current.value - baselineValue;
  const differencePct = (differenceAbs / baselineValue) * 100;
  // Strictly exceed the threshold - exactly at the boundary is not flagged,
  // matching benchmarking.ts's isWellAbove/isWellBelow (Phase 7), which
  // also require a strict ">"/"<" past their ratio, not "at or past" it.
  if (Math.abs(differencePct) <= DEVIATION_THRESHOLD_PCT) return null;

  const direction: "above" | "below" = differenceAbs > 0 ? "above" : "below";
  const sign = differencePct >= 0 ? "+" : "";
  const reason =
    `Investigate: current ${metricLabel} ${formatNum(current.value)}; ` +
    `baseline (${windowDays}-day avg) ${formatNum(baselineValue)}; ` +
    `${sign}${differencePct.toFixed(1)}%; unusually ${direction === "above" ? "high" : "low"} ${metricLabel}.`;

  return {
    type: "baseline_deviation",
    metricLabel,
    windowDays,
    currentValue: current.value,
    currentPeriod: { from: current.bucket, to: current.bucket },
    baselineValue,
    baselinePeriod: { from: windowPoints[0].bucket, to: windowPoints[windowPoints.length - 1].bucket },
    sampleSize,
    differenceAbs,
    differencePct,
    direction,
    reason,
  };
}

// Runs both the 7-day and 30-day baselines and returns every window that
// fires. The caller decides how many to surface - showing both when both
// fire is honest (each is self-contained evidence with its own baseline
// period and sample size), not redundant padding.
export function detectFleetBaselineAnomalies(
  series: DailyTrendPoint[],
  metricLabel: string,
): AnomalyBaselineSignal[] {
  return BASELINE_WINDOWS.map((windowDays) => detectBaselineAnomaly(series, windowDays, metricLabel)).filter(
    (s): s is AnomalyBaselineSignal => s !== null,
  );
}
