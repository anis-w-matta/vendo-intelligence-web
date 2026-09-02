// Canned upstream responses used across the route tests - representative
// shapes, not exhaustive data. Every route test drives the BFF purely
// through these mocks; no live Python service is needed to run the suite.
import { vi } from "vitest";

export const adminAuthMe = {
  login_id: "admin1",
  name: "Admin One",
  email: null,
  role: "admin",
  is_active: true,
};

export const salesmanAuthMe = { ...adminAuthMe, role: "salesman" };

export const roster = [
  { login_id: "sm_a", name: "Ahmed", email: null, role: "salesman", is_active: true },
  { login_id: "sm_b", name: "Bilal", email: null, role: "salesman", is_active: true },
];

export const requestsSummary = {
  status_counts: [
    { status: "new", count: 3 },
    { status: "rejected", count: 2 },
    { status: "committed", count: 5 },
  ],
  backlog: { total: 3, oldest_created_at: "2026-01-01T00:00:00Z", age_buckets: { "<5m": 1, "5-10m": 0, "10-30m": 2, "30-60m": 0, "60m+": 0 } },
  turnaround: { sample_size: 7, median_seconds: 3600, avg_seconds: 4000, p75_seconds: 5000, p90_seconds: 6000, p95_seconds: 7000 },
  rejection: { sample_size: 7, rejection_rate: 2 / 7, previous_period_rejection_rate: null },
  volume_over_time: [{ day: "2026-01-01T00:00:00Z", status: "new", count: 3 }],
};

export const aiQualitySummary = {
  reviewed_lines: 10,
  edited_lines: 2,
  overall_correction_rate: 0.2,
  low_confidence_count: 1,
  by_confidence_bucket: [
    { bucket: "low", sample_size: 1, correction_rate: 1.0 },
    { bucket: "medium", sample_size: 2, correction_rate: 0.5 },
    { bucket: "high", sample_size: 3, correction_rate: 0.0 },
    { bucket: "very_high", sample_size: 4, correction_rate: 0.0 },
  ],
};

// Phase 11: hotspots + trend mocks for the three new backendClient calls
// aiQuality.ts wires in alongside getAiQualitySummary.
export const aiQualityByItem = [
  { item_nb: "I1", sample_size: 5, correction_rate: 0.4 },
  { item_nb: "I2", sample_size: 3, correction_rate: 0.0 },
];

export const aiQualityByIntent = [
  { intent: "place_order", sample_size: 8, correction_rate: 0.25 },
  { intent: "return_order", sample_size: 2, correction_rate: 0.5 },
];

export const aiQualityTrend = [
  { bucket: "2026-07", sample_size: 4, correction_rate: 0.5 },
  { bucket: "2026-08", sample_size: 6, correction_rate: 0.1 },
];

export const salesmenRequestMetrics = [
  { salesman_id: "sm_a", request_count: 4, rejection_rate: 0.25, median_turnaround_seconds: 3600, ai_correction_rate: 0.1 },
  { salesman_id: "sm_b", request_count: 3, rejection_rate: 0.0, median_turnaround_seconds: 1800, ai_correction_rate: 0.0 },
];

// Phase 10: ActivityLog aggregate mock (GET /admin/analytics/activity-summary).
export const activitySummary = {
  by_hour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 9 ? 5 : 0 })),
  by_event_type: [
    { event_type: "voice_received", count: 8 },
    { event_type: "request_rejected", count: 2 },
  ],
  volume_over_time: [{ day: "2026-01-01T00:00:00Z", count: 10 }],
};

export const ordersSummary = {
  order_count: 10,
  order_line_count: 25,
  item_quantity: "150",
  avg_items_per_order: "15",
  orders_excluded_missing_commit_date: 1,
};

export const salesmenOrderMetrics = {
  by_salesman: [
    { salesman_id: "sm_a", order_count: 6, order_line_count: 15, item_quantity: "90", customer_count: 3 },
    { salesman_id: "sm_b", order_count: 4, order_line_count: 10, item_quantity: "60", customer_count: 2 },
  ],
  orders_excluded_missing_commit_date: 1,
};

export const topCustomers = [
  { cust_nb: "C1", customer_name: "Acme", order_count: 5, item_quantity: "80" },
];

export const topItems = [
  { item_nb: "I1", item_desc: "Widget", category: "Hardware", item_quantity: "50", order_count: 4 },
];

export const categoriesSummary = [
  { category: "Hardware", item_quantity: "50", order_count: 4, share_of_total_quantity: "0.5" },
];

export const customersSummary = { total: 100, assigned: 60, unassigned: 40 };

export const customersPerSalesman = [
  { salesman_id: "sm_a", current_customer_count: 40 },
  { salesman_id: "sm_b", current_customer_count: 20 },
];

export const customerDetailSummary = {
  cust_nb: "C1", customer_name: "Acme", current_salesman_id: "sm_a",
  order_count: 5, order_line_count: 12, item_quantity: "80",
  avg_items_per_order: "16", last_order_committed_at: "2026-05-01T00:00:00Z",
};

export const ownershipHistory = [
  { salesman_id: "sm_a", effective_from: "2026-01-01T00:00:00Z", effective_to: null },
];

export const itemDetailSummary = {
  item_nb: "I1", item_desc: "Widget", category: "Hardware",
  item_quantity: "50", order_count: 4, avg_qty_per_occurrence: "12.5",
};

export const catalogDataHealth = {
  total_orders: 10, orders_with_committed_at: 9, orders_with_resolvable_attribution: 8,
  total_order_details: 25, order_details_violating_qty_constraint: 0,
  order_details_orphaned: 0, order_details_invalid_item_ref: 1,
  orders_with_no_lines: 0, total_customers: 100, customers_with_salesman: 60,
  duplicate_order_groups: 0,
};

export const itemsPerOrderHistogram = [
  { bucket: "0-1", order_count: 1 },
  { bucket: "1-5", order_count: 9 },
];

// Shared trend-chart mock (Phase 6 Command Center fleet trend, Phase 7
// salesman-detail trend, Phase 8 customer-detail trend - same shape).
export const ordersTrend = {
  points: [
    { bucket: "2026-07", order_count: 4, order_line_count: 10, item_quantity: "60" },
    { bucket: "2026-08", order_count: 6, order_line_count: 15, item_quantity: "90" },
  ],
  orders_excluded_missing_commit_date: 1,
};

// Phase 8: one customer's committed order history (oldest first) - the raw
// material customerDetail.ts's activity-state classification runs on.
export const customerOrderHistory = [
  { order_nb: "O1", order_type: "standard", committed_at: "2026-06-01T00:00:00Z", item_quantity: "5", order_line_count: 2 },
  { order_nb: "O2", order_type: "standard", committed_at: "2026-07-01T00:00:00Z", item_quantity: "5", order_line_count: 2 },
  { order_nb: "O3", order_type: "standard", committed_at: "2026-08-01T00:00:00Z", item_quantity: "5", order_line_count: 2 },
];

// Phase 12: a real daily-granularity order-volume spike, used only by the
// route test that proves the Attention Center's fleet baseline arithmetic
// actually wires up end to end (mockAllClients()'s default `ordersTrend`
// above is a 2-point *monthly* series - deliberately too sparse/wrong-
// grained to ever produce a day-granularity signal, which is what makes
// the "stays honest when quiet" test meaningful). 20 prior days averaging
// 8.2 (16 days at 8, 4 at 9 - same construction as frontend/src/lib/
// anomalyBaseline.test.ts's "matches the phase spec's own example"
// case), then a current day at 12 - the literal example the phase spec
// itself gives ("Current orders 12; baseline (30-day avg) 8.2; +46.3%").
function dayBefore(base: string, daysAgo: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
const dailyBaselineValues = [...Array(16).fill(8), ...Array(4).fill(9)]; // sum 164 / 20 = 8.2
export const ordersTrendDaily = {
  points: [
    ...dailyBaselineValues.map((order_count, idx) => ({
      bucket: dayBefore("2026-09-01", dailyBaselineValues.length - idx),
      order_count,
      order_line_count: order_count * 2,
      item_quantity: String(order_count * 10),
    })),
    { bucket: "2026-09-01", order_count: 12, order_line_count: 24, item_quantity: "120" },
  ],
  orders_excluded_missing_commit_date: 0,
};

export function mockAllClients(options: { dailyOrdersTrend?: typeof ordersTrend } = {}) {
  vi.doMock("../src/lib/backendClient.js", () => ({
    getAuthMe: vi.fn().mockResolvedValue(adminAuthMe),
    listSalesmen: vi.fn().mockResolvedValue(roster),
    getRequestsSummary: vi.fn().mockResolvedValue(requestsSummary),
    getAiQualitySummary: vi.fn().mockResolvedValue(aiQualitySummary),
    getAiQualityByItem: vi.fn().mockResolvedValue(aiQualityByItem),
    getAiQualityByIntent: vi.fn().mockResolvedValue(aiQualityByIntent),
    getAiQualityTrend: vi.fn().mockResolvedValue(aiQualityTrend),
    getSalesmenRequestMetrics: vi.fn().mockResolvedValue(salesmenRequestMetrics),
    getActivitySummary: vi.fn().mockResolvedValue(activitySummary),
  }));
  vi.doMock("../src/lib/catalogClient.js", () => ({
    getOrdersSummary: vi.fn().mockResolvedValue(ordersSummary),
    getSalesmenOrderMetrics: vi.fn().mockResolvedValue(salesmenOrderMetrics),
    getTopCustomers: vi.fn().mockResolvedValue(topCustomers),
    getTopItems: vi.fn().mockResolvedValue(topItems),
    getCategoriesSummary: vi.fn().mockResolvedValue(categoriesSummary),
    getCustomersSummary: vi.fn().mockResolvedValue(customersSummary),
    getCustomersPerSalesman: vi.fn().mockResolvedValue(customersPerSalesman),
    getCustomerSummary: vi.fn().mockResolvedValue(customerDetailSummary),
    getCustomerOwnershipHistory: vi.fn().mockResolvedValue(ownershipHistory),
    getItemSummary: vi.fn().mockResolvedValue(itemDetailSummary),
    getCatalogDataHealth: vi.fn().mockResolvedValue(catalogDataHealth),
    getItemsPerOrderHistogram: vi.fn().mockResolvedValue(itemsPerOrderHistogram),
    getCustomerOrderHistory: vi.fn().mockResolvedValue(customerOrderHistory),
    // Default (no override): same flat monthly series regardless of
    // granularity - preserves every pre-Phase-12 test's expectations
    // exactly. Phase 12's own route test passes `dailyOrdersTrend` to get
    // a real day-granularity series back only when granularity: "day" is
    // requested.
    getOrdersTrend: vi.fn().mockImplementation((params: { granularity?: string } = {}) =>
      Promise.resolve(
        params.granularity === "day" && options.dailyOrdersTrend ? options.dailyOrdersTrend : ordersTrend,
      ),
    ),
  }));
}
