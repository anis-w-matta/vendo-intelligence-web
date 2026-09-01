// The master prompt's metric contract: every response identifies name,
// value, unit, period, filters, source, formula, completeness, and
// last_updated - see 03_phase_3_node_backend.md. Applied fully to
// single-value KPI metrics (Metric<T>); list/table endpoints (rankings,
// time series) carry the same source/formula/completeness/filters/
// last_updated once at the envelope level rather than duplicating it per
// row.
//
// completeness uses the master prompt's own vocabulary (COMPLETE/PARTIAL/
// LIMITED/UNAVAILABLE, see 09_phase_9_data_health.md) - never a fabricated
// zero for something that is actually unknown.

export type CompletenessStatus = "COMPLETE" | "PARTIAL" | "LIMITED" | "UNAVAILABLE";

export interface Period {
  from: string | null;
  to: string | null;
}

export interface Metric<T> {
  name: string;
  value: T;
  unit: string;
  period: Period | null;
  filters: Record<string, unknown>;
  source: string;
  formula: string;
  completeness: CompletenessStatus;
  completeness_note?: string;
  last_updated: string;
}

export function metric<T>(args: Omit<Metric<T>, "last_updated">): Metric<T> {
  return { ...args, last_updated: new Date().toISOString() };
}

export interface EnvelopeMeta {
  source: string;
  formula?: string;
  filters: Record<string, unknown>;
  completeness: CompletenessStatus;
  completeness_note?: string;
  period: Period | null;
  last_updated: string;
}

export interface Envelope<T> {
  data: T;
  meta: EnvelopeMeta;
}

export function envelope<T>(data: T, meta: Omit<EnvelopeMeta, "last_updated">): Envelope<T> {
  return { data, meta: { ...meta, last_updated: new Date().toISOString() } };
}
