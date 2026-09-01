// Phase 7 fleet-benchmarking arithmetic, shared by:
//  - SalesPage's workload-vs-output scatter + quadrant split (#5/#6)
//  - SalesmanDetailPage's per-salesman investigation-signal flags (#7)
//
// Pure, side-effect-free: every input here is a number the BFF already
// computed (order_count, customer_count, item_quantity, rejection_rate,
// median_turnaround_seconds) - this module only compares those numbers
// against a fleet median/average, it never invents or recomputes a
// business metric itself.
//
// IMPORTANT per the Phase 7 spec: quadrant labels and flags are
// investigation signals, never performance verdicts. Every user-facing
// string here must read as "Investigate: ..." - not a conclusion.

export interface ScatterPoint {
  salesman_id: string;
  x: number;
  y: number;
}

export type Quadrant =
  | "large-portfolio-high-activity"
  | "large-portfolio-low-activity"
  | "small-portfolio-high-activity"
  | "small-portfolio-low-activity";

export interface QuadrantPoint extends ScatterPoint {
  quadrant: Quadrant;
}

export interface QuadrantLabel {
  quadrant: Quadrant;
  title: string;
  note: string;
}

// Descriptive, neutral labels - x = customer portfolio size, y = order/
// item activity (SalesPage documents which of order_count/item_quantity
// it plots as y).
export const QUADRANT_LABELS: Record<Quadrant, QuadrantLabel> = {
  "large-portfolio-high-activity": {
    quadrant: "large-portfolio-high-activity",
    title: "Large portfolio, high activity",
    note: "Investigate: a large customer portfolio paired with high order/item activity.",
  },
  "large-portfolio-low-activity": {
    quadrant: "large-portfolio-low-activity",
    title: "Large portfolio, low activity",
    note: "Investigate: possible under-engagement of the portfolio, or a data/attribution gap.",
  },
  "small-portfolio-high-activity": {
    quadrant: "small-portfolio-high-activity",
    title: "Small portfolio, high activity",
    note: "Investigate: possible over-concentration risk, or a genuinely small but very active book.",
  },
  "small-portfolio-low-activity": {
    quadrant: "small-portfolio-low-activity",
    title: "Small portfolio, low activity",
    note: "Investigate: a small customer portfolio paired with low order/item activity.",
  },
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface QuadrantSplit {
  medianX: number | null;
  medianY: number | null;
  points: QuadrantPoint[];
}

// Splits `points` into 4 quadrants using the fleet MEDIAN of x and y (not
// mean - more robust to outliers, and simpler to defend, per the spec).
// At/above the median on an axis counts as the "large"/"high" side of it.
export function classifyQuadrants(points: ScatterPoint[]): QuadrantSplit {
  const medianX = median(points.map((p) => p.x));
  const medianY = median(points.map((p) => p.y));
  if (medianX === null || medianY === null) {
    return { medianX, medianY, points: [] };
  }
  const classified: QuadrantPoint[] = points.map((p) => {
    const highX = p.x >= medianX;
    const highY = p.y >= medianY;
    let quadrant: Quadrant;
    if (highX && highY) quadrant = "large-portfolio-high-activity";
    else if (highX && !highY) quadrant = "large-portfolio-low-activity";
    else if (!highX && highY) quadrant = "small-portfolio-high-activity";
    else quadrant = "small-portfolio-low-activity";
    return { ...p, quadrant };
  });
  return { medianX, medianY, points: classified };
}

// "Well above/below the fleet average" - one shared definition used by
// both the quadrant framing and the per-salesman investigation flags, so
// the two views of the same page never disagree on what "well above"
// means.
export const WELL_ABOVE_RATIO = 1.5;
export const WELL_BELOW_RATIO = 0.75;

// Only ever compares two known, non-null numbers - never fabricates a
// comparison against a missing value (respects completeness/null the
// same way the rest of this codebase does).
export function isWellAbove(value: number | null, average: number | null): boolean {
  if (value === null || average === null || average <= 0) return false;
  return value > average * WELL_ABOVE_RATIO;
}

export function isWellBelow(value: number | null, average: number | null): boolean {
  if (value === null || average === null || average <= 0) return false;
  return value < average * WELL_BELOW_RATIO;
}

export interface FleetAverageInput {
  order_count: number | null;
  customer_count: number | null;
  rejection_rate: number | null;
  median_turnaround_seconds: number | null;
}

export interface SalesmanSignalInput {
  order_count: number | null;
  customer_count: number | null;
  rejection_rate: number | null;
  median_turnaround_seconds: number | null;
  fleet_average: FleetAverageInput;
}

export interface InvestigationFlag {
  id: string;
  label: string;
}

// Phase 7 gap #7 - flags are notes, not alarms; every label reads as
// "Investigate: ...". Only computed when both the salesman's own value
// and the fleet average are non-null.
export function computeInvestigationFlags(input: SalesmanSignalInput): InvestigationFlag[] {
  const { order_count, customer_count, rejection_rate, median_turnaround_seconds, fleet_average } = input;
  const flags: InvestigationFlag[] = [];

  if (
    isWellAbove(customer_count, fleet_average.customer_count) &&
    isWellBelow(order_count, fleet_average.order_count)
  ) {
    flags.push({
      id: "large-portfolio-low-activity",
      label: "Investigate: large customer portfolio paired with low order activity.",
    });
  }

  if (
    isWellAbove(order_count, fleet_average.order_count) &&
    isWellBelow(customer_count, fleet_average.customer_count)
  ) {
    flags.push({
      id: "high-activity-small-portfolio",
      label: "Investigate: high order activity concentrated in a small customer portfolio.",
    });
  }

  if (isWellAbove(rejection_rate, fleet_average.rejection_rate)) {
    flags.push({
      id: "high-rejection-rate",
      label: "Investigate: rejection rate well above the fleet average.",
    });
  }

  if (isWellAbove(median_turnaround_seconds, fleet_average.median_turnaround_seconds)) {
    flags.push({
      id: "high-turnaround",
      label: "Investigate: turnaround time well above the fleet average.",
    });
  }

  return flags;
}
