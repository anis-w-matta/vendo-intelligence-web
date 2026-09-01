// Mirrors vendo-intelligence-web/backend/src/lib/metricContract.ts exactly.
// React renders these fields as-is - it never recomputes a business metric
// itself (Phase 5 requirement: "must not independently redefine business
// calculations").
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

// ---- Shared row shapes ----

export interface SalesmanRow {
  salesman_id: string;
  salesman_name: string | null;
  is_active?: boolean;
  order_count: number;
  order_line_count: number;
  item_quantity: string;
  customer_count: number;
  orders_per_customer: number | null;
  // Phase 7: items/customer, items/order.
  items_per_customer: number | null;
  items_per_order: number | null;
  rejection_rate: number | null;
  median_turnaround_seconds: number | null;
  ai_correction_rate: number | null;
  request_count: number;
}

// Phase 7: this salesman's own numbers vs. the fleet's - an investigation
// signal (median/mean across active salesmen today), never a performance
// verdict. sample_size is how many active salesmen it was computed over.
export interface FleetAverage {
  sample_size: number;
  order_count: number | null;
  item_quantity: number | null;
  customer_count: number | null;
  rejection_rate: number | null;
  median_turnaround_seconds: number | null;
}

export interface OrdersTrendPoint {
  bucket: string;
  order_count: number;
  order_line_count: number;
  item_quantity: string;
}

export interface RequestVolumePoint {
  day: string;
  status: string;
  count: number;
}

export interface RequestVolumeTrendPoint {
  bucket: string;
  count: number;
}

export interface RequestsSummaryData {
  status_counts: StatusCount[];
  backlog: Backlog;
  turnaround: TurnaroundStats;
  rejection: RejectionStats;
  volume_over_time: RequestVolumePoint[];
}

export interface SalesmanDetail {
  salesman_id: string;
  salesman_name: string | null;
  is_active: boolean;
  order_count: number;
  order_line_count: number;
  item_quantity: string;
  customer_count: number;
  // Phase 7: orders/customer, items/customer, items/order (same
  // arithmetic as SalesmanRow above).
  orders_per_customer: number | null;
  items_per_customer: number | null;
  items_per_order: number | null;
  request_count: number;
  rejection_rate: number | null;
  median_turnaround_seconds: number | null;
  ai_correction_rate: number | null;
  top_customers: TopCustomerRow[];
  fleet_average: FleetAverage;
  orders_trend: OrdersTrendPoint[];
  requests_summary: RequestsSummaryData;
  request_volume_trend: RequestVolumeTrendPoint[];
}

export interface TopCustomerRow {
  cust_nb: string;
  customer_name: string;
  order_count: number;
  item_quantity: string;
}

export interface CustomersSummary {
  total: number;
  assigned: number;
  unassigned: number;
}

export interface CustomersPageData {
  summary: CustomersSummary;
  top_customers_by_order_count: TopCustomerRow[];
  top_customers_by_item_quantity: TopCustomerRow[];
}

export interface OwnershipHistoryRow {
  salesman_id: string | null;
  effective_from: string;
  effective_to: string | null;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface Backlog {
  total: number;
  oldest_created_at: string | null;
  age_buckets: Record<string, number>;
}

// Phase 8: the exact six activity states computed by
// backend/src/lib/customerActivity.ts from one customer's real committed
// order history - rendered verbatim, never re-derived or predicted here.
export type ActivityState = "New" | "Active" | "Stable" | "Declining" | "Dormant" | "Insufficient Data";

// Mirrors backend/src/lib/customerActivity.ts's IntervalStats exactly -
// every field is null (not a fabricated zero) when there isn't enough
// order history to compute it.
export interface IntervalStats {
  orderCount: number;
  avgIntervalDays: number | null;
  medianIntervalDays: number | null;
  recentIntervalDays: number | null;
  longestGapDays: number | null;
  activeDays: number | null;
  daysSinceLastOrder: number | null;
}

export interface QuantityAnomalySignal {
  type: "quantity_anomaly";
  mostRecentQuantity: number;
  priorAverageQuantity: number;
  ratio: number;
}

export interface LongGapSignal {
  type: "long_gap";
  daysSinceLastOrder: number;
  baselineIntervalDays: number;
}

// Evidence, never a verdict - render as "Investigate: ..." prompts only.
export type ActivitySignal = QuantityAnomalySignal | LongGapSignal;

export interface OrderTrendPoint {
  bucket: string;
  order_count: number;
  order_line_count: number;
  item_quantity: string;
}

export interface CustomerOrderTrend {
  points: OrderTrendPoint[];
  orders_excluded_missing_commit_date: number;
}

export interface CustomerDetailData {
  customer: {
    cust_nb: string;
    customer_name: string;
    current_salesman_id: string | null;
    order_count: number;
    order_line_count: number;
    item_quantity: string;
    avg_items_per_order: string;
    last_order_committed_at: string | null;
  };
  ownership_history: OwnershipHistoryRow[];
  request_activity: {
    status_counts: StatusCount[];
    backlog: Backlog;
  };
  activity_state: ActivityState;
  interval_stats: IntervalStats;
  signals: ActivitySignal[];
  top_items: TopItemRow[];
  order_trend: CustomerOrderTrend;
}

export interface TopItemRow {
  item_nb: string;
  item_desc: string;
  category: string | null;
  item_quantity: string;
  order_count: number;
  customer_count: number;
}

export interface ItemsPageData {
  top_items_by_quantity: TopItemRow[];
  top_items_by_order_frequency: TopItemRow[];
}

export interface ItemDetailData {
  item_nb: string;
  item_desc: string;
  category: string | null;
  item_quantity: string;
  order_count: number;
  customer_count: number;
  avg_qty_per_occurrence: string;
}

export interface CategoryRow {
  category: string;
  item_quantity: string;
  order_count: number;
  customer_count: number;
  share_of_total_quantity: string;
}

export interface TurnaroundStats {
  sample_size: number;
  median_seconds: number | null;
  avg_seconds: number | null;
  p75_seconds: number | null;
  p90_seconds: number | null;
  p95_seconds: number | null;
}

export interface RejectionStats {
  sample_size: number;
  rejection_rate: number | null;
  previous_period_rejection_rate: number | null;
}

export interface OperationsPageData {
  backlog: Backlog;
  turnaround: TurnaroundStats;
  rejection: RejectionStats;
  rejection_by_salesman: { salesman_id: string; rejection_rate: number | null; request_count: number }[];
  sla_compliance: null;
}

export interface AiQualityBucket {
  bucket: string;
  sample_size: number;
  correction_rate: number | null;
}

export interface AiQualityData {
  reviewed_lines: number;
  edited_lines: number;
  overall_correction_rate: number | null;
  low_confidence_count: number;
  by_confidence_bucket: AiQualityBucket[];
}

export interface HistogramBucket {
  bucket: string;
  order_count: number;
}

export interface OrdersSummary {
  order_count: number;
  order_line_count: number;
  item_quantity: string;
  avg_items_per_order: string;
  orders_excluded_missing_commit_date: number;
}

export interface OrdersPageData {
  summary: OrdersSummary;
  items_per_order_histogram: HistogramBucket[];
}

export interface RequestsPageData {
  status_counts: StatusCount[];
  backlog: Backlog;
  turnaround: TurnaroundStats;
  rejection: RejectionStats;
  volume_over_time?: { bucket: string; count: number }[];
}

export interface DataHealthField {
  count?: number;
  total: number;
  pct?: number | null;
  violations?: number;
  status: CompletenessStatus | "COMPLETE";
  note?: string;
}

export interface MetricDictionaryEntry {
  metric: string;
  definition: string;
  formula: string;
  source: string;
  filters: string[];
  limitations: string;
}

export interface DataHealthData {
  completeness: Record<string, DataHealthField>;
  legacy_data_limitations: string[];
  metric_dictionary: MetricDictionaryEntry[];
}

export interface OrderTrendPoint {
  bucket: string;
  order_count: number;
  order_line_count: number;
  item_quantity: string;
}

export interface OverviewData {
  kpis: Record<string, Metric<unknown>>;
  sales_by_salesman: Envelope<{ salesman_id: string; salesman_name: string | null; order_count: number; item_quantity: string }[]>;
  request_volume_over_time: Envelope<{ bucket: string; count: number }[]>;
  order_trend: Envelope<OrderTrendPoint[]>;
  customers: Envelope<CustomersSummary>;
  attention: {
    insights: unknown[];
    status: CompletenessStatus;
    note: string;
  };
}

export interface InsightsData {
  insights: unknown[];
  status: CompletenessStatus;
  note: string;
  last_updated: string;
}

export interface Filters {
  date_from?: string;
  date_to?: string;
  salesman?: string;
  customer?: string;
  item?: string;
  category?: string;
  status?: string;
  intent?: string;
  order_source?: string;
  limit?: number;
}
