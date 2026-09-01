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
  backlog: { total: 3, oldest_created_at: "2026-01-01T00:00:00Z", age_buckets: { "0-1d": 1, "1-3d": 2, "3-7d": 0, "7d+": 0 } },
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

export const salesmenRequestMetrics = [
  { salesman_id: "sm_a", request_count: 4, rejection_rate: 0.25, median_turnaround_seconds: 3600, ai_correction_rate: 0.1 },
  { salesman_id: "sm_b", request_count: 3, rejection_rate: 0.0, median_turnaround_seconds: 1800, ai_correction_rate: 0.0 },
];

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
};

export const itemsPerOrderHistogram = [
  { bucket: "0-1", order_count: 1 },
  { bucket: "1-5", order_count: 9 },
];

// Phase 7 salesman-detail trend chart (orders/quantity over time).
export const ordersTrend = {
  points: [
    { bucket: "2026-01", order_count: 3, order_line_count: 8, item_quantity: "45" },
    { bucket: "2026-02", order_count: 3, order_line_count: 7, item_quantity: "45" },
  ],
  orders_excluded_missing_commit_date: 1,
};

export function mockAllClients() {
  vi.doMock("../src/lib/backendClient.js", () => ({
    getAuthMe: vi.fn().mockResolvedValue(adminAuthMe),
    listSalesmen: vi.fn().mockResolvedValue(roster),
    getRequestsSummary: vi.fn().mockResolvedValue(requestsSummary),
    getAiQualitySummary: vi.fn().mockResolvedValue(aiQualitySummary),
    getSalesmenRequestMetrics: vi.fn().mockResolvedValue(salesmenRequestMetrics),
  }));
  vi.doMock("../src/lib/catalogClient.js", () => ({
    getOrdersSummary: vi.fn().mockResolvedValue(ordersSummary),
    getSalesmenOrderMetrics: vi.fn().mockResolvedValue(salesmenOrderMetrics),
    getTopCustomers: vi.fn().mockResolvedValue(topCustomers),
    getTopItems: vi.fn().mockResolvedValue(topItems),
    getCategoriesSummary: vi.fn().mockResolvedValue(categoriesSummary),
    getCustomersSummary: vi.fn().mockResolvedValue(customersSummary),
    getCustomerSummary: vi.fn().mockResolvedValue(customerDetailSummary),
    getCustomerOwnershipHistory: vi.fn().mockResolvedValue(ownershipHistory),
    getItemSummary: vi.fn().mockResolvedValue(itemDetailSummary),
    getCatalogDataHealth: vi.fn().mockResolvedValue(catalogDataHealth),
    getItemsPerOrderHistogram: vi.fn().mockResolvedValue(itemsPerOrderHistogram),
    getOrdersTrend: vi.fn().mockResolvedValue(ordersTrend),
  }));
}
