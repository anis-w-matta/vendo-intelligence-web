// Phase 10 (Operations Command Center): operational-pressure signals
// computed purely from numbers the BFF already returned on
// GET /api/admin/intelligence/operations (backlog age buckets/total,
// turnaround percentiles, rejection rate vs. its own previous period).
// Every function here is pure and side-effect-free, following the same
// pattern as frontend/src/lib/benchmarking.ts (Phase 7) and
// backend/src/lib/customerActivity.ts (Phase 8): it never fabricates a
// number, and every flag it raises describes what the data shows, never
// why - "Investigate: ..." phrasing only, never a causal claim ("the
// spec's own words: "Detect potential operational pressure without
// claiming causation").

export interface BacklogSkewSignal {
  type: "backlog_skew";
  oldestBucketsShare: number; // fraction (0-1) of the backlog total in the two oldest age buckets
  oldestBucketKeys: string[];
}

export interface TurnaroundTailSignal {
  type: "turnaround_tail";
  p90Seconds: number;
  medianSeconds: number;
  ratio: number; // p90Seconds / medianSeconds
}

export interface RejectionAboveBaselineSignal {
  type: "rejection_above_baseline";
  currentRate: number;
  previousRate: number;
  ratio: number; // currentRate / previousRate
}

export type OperationalPressureSignal =
  | BacklogSkewSignal
  | TurnaroundTailSignal
  | RejectionAboveBaselineSignal;

export interface OperationalPressureFlag {
  signal: OperationalPressureSignal;
  label: string; // always "Investigate: ..." - an observation, never a verdict
}

// Thresholds are documented and local to this view - not derived from any
// VeNdO spec defined elsewhere in this project (there is no SLA or
// pressure threshold defined anywhere - see OperationsPage's own note on
// sla_compliance being null for the same reason).
export const BACKLOG_SKEW_SHARE_THRESHOLD = 0.5; // majority of the backlog sitting in the two oldest age buckets
export const TURNAROUND_TAIL_RATIO = 3; // p90 more than 3x the median
export const REJECTION_BASELINE_RATIO = 1.5; // current rejection rate more than 1.5x its own previous-period rate

// Canonical minute-scale age-bucket order, matching the Python backend's
// _age_bucket() labels exactly (app/services/analytics.py). "The two
// oldest buckets" only means something if the input actually uses these
// keys - an unrecognized bucket shape is left unflagged rather than
// guessed at.
const BUCKET_AGE_ORDER = ["<5m", "5-10m", "10-30m", "30-60m", "60m+"];

export function detectBacklogSkew(
  ageBuckets: Record<string, number>,
  total: number,
): BacklogSkewSignal | null {
  if (total <= 0) return null;
  const present = BUCKET_AGE_ORDER.filter((k) => k in ageBuckets);
  if (present.length < 2) return null;
  const oldest = present.slice(-2);
  const oldestCount = oldest.reduce((sum, k) => sum + (ageBuckets[k] ?? 0), 0);
  const share = oldestCount / total;
  if (share <= BACKLOG_SKEW_SHARE_THRESHOLD) return null;
  return { type: "backlog_skew", oldestBucketsShare: share, oldestBucketKeys: oldest };
}

export function detectTurnaroundTail(
  p90Seconds: number | null,
  medianSeconds: number | null,
): TurnaroundTailSignal | null {
  if (p90Seconds === null || medianSeconds === null || medianSeconds <= 0) return null;
  const ratio = p90Seconds / medianSeconds;
  if (ratio <= TURNAROUND_TAIL_RATIO) return null;
  return { type: "turnaround_tail", p90Seconds, medianSeconds, ratio };
}

// previous_period_rejection_rate is only ever non-null when both
// date_from and date_to were passed (the Python backend's
// _previous_period() helper requires a fixed-length range to mirror) - an
// open-ended filter always yields null here, so this signal frequently
// won't fire in practice. That's a documented, honest gap, not a bug.
export function detectRejectionAboveBaseline(
  currentRate: number | null,
  previousRate: number | null,
): RejectionAboveBaselineSignal | null {
  if (currentRate === null || previousRate === null || previousRate <= 0) return null;
  const ratio = currentRate / previousRate;
  if (ratio <= REJECTION_BASELINE_RATIO) return null;
  return { type: "rejection_above_baseline", currentRate, previousRate, ratio };
}

function labelFor(signal: OperationalPressureSignal): string {
  switch (signal.type) {
    case "backlog_skew":
      return `Investigate: ${(signal.oldestBucketsShare * 100).toFixed(0)}% of the open backlog falls in the oldest age buckets (${signal.oldestBucketKeys.join(", ")}).`;
    case "turnaround_tail":
      return `Investigate: P90 turnaround (${Math.round(signal.p90Seconds)}s) is ${signal.ratio.toFixed(1)}x the median (${Math.round(signal.medianSeconds)}s) - a widening tail.`;
    case "rejection_above_baseline":
      return `Investigate: rejection rate (${(signal.currentRate * 100).toFixed(1)}%) is ${signal.ratio.toFixed(1)}x its previous-period baseline (${(signal.previousRate * 100).toFixed(1)}%).`;
  }
}

export interface OperationalPressureInput {
  ageBuckets: Record<string, number>;
  backlogTotal: number;
  p90Seconds: number | null;
  medianSeconds: number | null;
  currentRejectionRate: number | null;
  previousPeriodRejectionRate: number | null;
}

export function computeOperationalPressureFlags(
  input: OperationalPressureInput,
): OperationalPressureFlag[] {
  const signals: (OperationalPressureSignal | null)[] = [
    detectBacklogSkew(input.ageBuckets, input.backlogTotal),
    detectTurnaroundTail(input.p90Seconds, input.medianSeconds),
    detectRejectionAboveBaseline(input.currentRejectionRate, input.previousPeriodRejectionRate),
  ];
  return signals
    .filter((s): s is OperationalPressureSignal => s !== null)
    .map((signal) => ({ signal, label: labelFor(signal) }));
}
