// Command Center (Phase 5) - "What is happening across VeNdO?" No
// revenue/price/order-value KPI anywhere below, per the master prompt's
// non-financial rule.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toOrdersParams, toRequestsParams } from "../lib/filters.js";
import { metric, envelope, type CompletenessStatus } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";

export default async function overviewRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/overview", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const authorization = request.headers.authorization!;
    const period = periodOf(f);
    const filtersRecord = { ...f };

    try {
      const [orders, requests, customers, roster, salesmenOrders] = await Promise.all([
        catalogClient.getOrdersSummary(toOrdersParams(f)),
        backendClient.getRequestsSummary(authorization, toRequestsParams(f)),
        catalogClient.getCustomersSummary(),
        backendClient.listSalesmen(authorization),
        catalogClient.getSalesmenOrderMetrics(toOrdersParams(f)),
      ]);

      const ordersCompleteness: CompletenessStatus =
        orders.orders_excluded_missing_commit_date > 0 ? "PARTIAL" : "COMPLETE";

      const kpis = {
        total_orders: metric({
          name: "Total Orders", value: orders.order_count, unit: "orders", period,
          filters: filtersRecord, source: "catalog-service order_header",
          formula: "COUNT(DISTINCT (order_nb, order_type))",
          completeness: ordersCompleteness,
          completeness_note: orders.orders_excluded_missing_commit_date > 0
            ? `${orders.orders_excluded_missing_commit_date} order(s) excluded - no commit date recorded (pre-Phase-2 legacy orders)`
            : undefined,
        }),
        total_item_quantity: metric({
          name: "Total Item Quantity", value: orders.item_quantity, unit: "units", period,
          filters: filtersRecord, source: "catalog-service order_details",
          formula: "SUM(order_details.qty)", completeness: ordersCompleteness,
        }),
        total_order_lines: metric({
          name: "Total Order Lines", value: orders.order_line_count, unit: "lines", period,
          filters: filtersRecord, source: "catalog-service order_details",
          formula: "COUNT(order_details.*)", completeness: ordersCompleteness,
        }),
        average_items_per_order: metric({
          name: "Average Items per Order", value: orders.avg_items_per_order, unit: "units/order",
          period, filters: filtersRecord, source: "catalog-service order_details",
          formula: "item_quantity / order_count", completeness: ordersCompleteness,
        }),
        total_requests: metric({
          name: "Total Requests",
          value: requests.status_counts.reduce((sum, s) => sum + s.count, 0),
          unit: "requests", period, filters: filtersRecord, source: "backend pending_request",
          formula: "COUNT(pending_request.*)", completeness: "COMPLETE" as CompletenessStatus,
        }),
        current_backlog: metric({
          name: "Current Backlog", value: requests.backlog.total, unit: "requests", period: null,
          filters: filtersRecord, source: "backend pending_request",
          formula: "COUNT WHERE status IN (new, in_review, callback)",
          completeness: "COMPLETE" as CompletenessStatus,
        }),
        rejection_rate: metric({
          name: "Rejection Rate", value: requests.rejection.rejection_rate, unit: "ratio", period,
          filters: filtersRecord, source: "backend pending_request",
          formula: "rejected / (rejected + committed)",
          completeness: requests.rejection.sample_size > 0 ? "COMPLETE" as CompletenessStatus : "UNAVAILABLE" as CompletenessStatus,
        }),
        median_turnaround: metric({
          name: "Median Turnaround", value: requests.turnaround.median_seconds, unit: "seconds",
          period, filters: filtersRecord, source: "backend pending_request",
          formula: "median(decided_at - created_at) over rejected/committed requests",
          completeness: requests.turnaround.sample_size > 0 ? "PARTIAL" as CompletenessStatus : "UNAVAILABLE" as CompletenessStatus,
          completeness_note: "Only requests committed after Phase 2 shipped keep their row - completeness grows over time",
        }),
      };

      const salesmenByLoginId = new Map(roster.map((s) => [s.login_id, s]));
      const salesBySalesman = salesmenOrders.by_salesman
        .filter((row) => row.salesman_id !== null)
        .map((row) => ({
          salesman_id: row.salesman_id,
          salesman_name: salesmenByLoginId.get(row.salesman_id!)?.name ?? null,
          order_count: row.order_count,
          item_quantity: row.item_quantity,
        }))
        .sort((a, b) => b.order_count - a.order_count);

      return reply.send({
        kpis,
        sales_by_salesman: envelope(salesBySalesman, {
          source: "catalog-service order_header/order_details + customer_ownership_history, backend salesmen",
          filters: filtersRecord, period,
          completeness: salesmenOrders.orders_excluded_missing_commit_date > 0 ? "PARTIAL" : "COMPLETE",
          completeness_note: salesmenOrders.orders_excluded_missing_commit_date > 0
            ? `${salesmenOrders.orders_excluded_missing_commit_date} order(s) excluded - no resolvable point-in-time salesman attribution`
            : undefined,
        }),
        request_volume_over_time: envelope(requests.volume_over_time, {
          source: "backend pending_request", filters: filtersRecord, period,
          completeness: "COMPLETE",
        }),
        customers: envelope(
          { assigned: customers.assigned, unassigned: customers.unassigned, total: customers.total },
          {
            source: "catalog-service customer", filters: {}, period: null,
            completeness: "PARTIAL",
            completeness_note: "active/inactive not computed in this pass - only assigned/unassigned counts",
          },
        ),
        attention: {
          insights: [] as unknown[],
          status: "UNAVAILABLE" as CompletenessStatus,
          note: "Evidence-backed anomaly detection (backlog spikes, rejection increases, etc.) ships with the Phase 8 insights engine - see /api/admin/intelligence/insights.",
        },
      });
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
