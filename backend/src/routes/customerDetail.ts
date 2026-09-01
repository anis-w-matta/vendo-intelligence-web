// Phase 6 "Customer 360" - owner, orders, order lines, item quantity,
// average items/order, request activity, last activity, trend, plus the
// full point-in-time ownership history (Phase 2's customer_ownership_history).
//
// Phase 8 additions: activity-state classification, interval statistics,
// and investigation signals - all computed by the shared, tested
// backend/src/lib/customerActivity.ts from this customer's real committed
// order history (never invented here); plus a per-customer top-items
// ranking and an order-count trend, both scoped via cust_nb.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toRequestsParams } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";
import {
  classifyActivity,
  computeIntervalStats,
  detectSignals,
  type OrderHistoryPoint,
} from "../lib/customerActivity.js";

// catalog-service serializes item_quantity as a Decimal-safe string (see
// catalogClient.ts) - this is the one place that string is parsed into the
// number customerActivity.ts's OrderHistoryPoint expects. Factored out so
// the parsing/mapping is unit-testable on its own, per the master prompt's
// "add tests for anything non-trivial beyond simple wiring" instruction.
export function toOrderHistoryPoints(
  rows: catalogClient.CustomerOrderHistoryRowOut[],
): OrderHistoryPoint[] {
  return rows.map((r) => ({ committedAt: r.committed_at, itemQuantity: Number(r.item_quantity) }));
}

export default async function customerDetailRoutes(app: FastifyInstance) {
  app.get(
    "/api/admin/intelligence/customers/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = FiltersQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
      }
      const f = { ...parsed.data, customer: id };
      const authorization = request.headers.authorization!;
      const period = periodOf(f);

      try {
        const [summary, ownershipHistory, requestActivity, orderHistory, topItems, orderTrend] =
          await Promise.all([
            catalogClient.getCustomerSummary(id),
            catalogClient.getCustomerOwnershipHistory(id),
            backendClient.getRequestsSummary(authorization, toRequestsParams(f)),
            catalogClient.getCustomerOrderHistory(id),
            catalogClient.getTopItems("quantity", 10, {
              cust_nb: id, date_from: f.date_from, date_to: f.date_to, category: f.category,
            }),
            catalogClient.getOrdersTrend({ cust_nb: id, date_from: f.date_from, date_to: f.date_to }),
          ]);

        const historyPoints = toOrderHistoryPoints(orderHistory);
        const activityState = classifyActivity(historyPoints);
        const intervalStats = computeIntervalStats(historyPoints);
        const signals = detectSignals(historyPoints);

        const excludedCount = orderTrend.orders_excluded_missing_commit_date;
        const activityNote =
          'Activity-state classification and the order trend use only orders with a recorded commit date; ' +
          'a customer whose only orders predate that tracking shows "Insufficient Data" or "New", not a fabricated state.';

        return reply.send(
          envelope(
            {
              customer: summary,
              ownership_history: ownershipHistory,
              request_activity: {
                status_counts: requestActivity.status_counts,
                backlog: requestActivity.backlog,
              },
              activity_state: activityState,
              interval_stats: intervalStats,
              signals,
              top_items: topItems,
              order_trend: orderTrend,
            },
            {
              source:
                "catalog-service customer/order_header/order_details + customer_ownership_history, backend pending_request",
              filters: { ...f },
              period,
              completeness: excludedCount > 0 ? "PARTIAL" : "COMPLETE",
              completeness_note: excludedCount > 0
                ? `${excludedCount} order(s) excluded from the trend - no commit date recorded. ${activityNote}`
                : activityNote,
            },
          ),
        );
      } catch (err) {
        return handleUpstreamError(err, reply);
      }
    },
  );
}
