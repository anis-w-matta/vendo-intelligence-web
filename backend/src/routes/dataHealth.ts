// Phase 9 Data Health and Trust Center - "Never hide limitations."
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { envelope } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import * as catalogClient from "../lib/catalogClient.js";
import { METRIC_DICTIONARY } from "../lib/metricDictionary.js";
import { handleUpstreamError } from "../lib/errors.js";

function pct(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

export default async function dataHealthRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/data-health", { preHandler: requireAdmin }, async (request, reply) => {
    const authorization = request.headers.authorization!;
    try {
      const [catalogHealth, requests] = await Promise.all([
        catalogClient.getCatalogDataHealth(),
        backendClient.getRequestsSummary(authorization, {}),
      ]);

      const totalRequests = requests.status_counts.reduce((sum, s) => sum + s.count, 0);
      const committedRequests = requests.status_counts.find((s) => s.status === "committed")?.count ?? 0;

      return reply.send(
        envelope(
          {
            completeness: {
              orders_with_committed_at: {
                count: catalogHealth.orders_with_committed_at,
                total: catalogHealth.total_orders,
                pct: pct(catalogHealth.orders_with_committed_at, catalogHealth.total_orders),
                status: catalogHealth.orders_with_committed_at === catalogHealth.total_orders ? "COMPLETE" : "PARTIAL",
              },
              orders_with_resolvable_salesman_attribution: {
                count: catalogHealth.orders_with_resolvable_attribution,
                total: catalogHealth.total_orders,
                pct: pct(catalogHealth.orders_with_resolvable_attribution, catalogHealth.total_orders),
                status:
                  catalogHealth.orders_with_resolvable_attribution === catalogHealth.total_orders
                    ? "COMPLETE"
                    : "PARTIAL",
              },
              order_details_qty_constraint: {
                violations: catalogHealth.order_details_violating_qty_constraint,
                total: catalogHealth.total_order_details,
                status: "COMPLETE",
                note: "Enforced by a DB CHECK constraint since Phase 2 - structurally guaranteed zero, not just observed.",
              },
              requests_with_committed_order_lineage: {
                count: committedRequests,
                total: totalRequests,
                pct: pct(committedRequests, totalRequests),
                status: "PARTIAL",
                note: "Only requests committed after Phase 2 shipped keep committed_order_nb - earlier ones were deleted on commit and cannot be recovered.",
              },
            },
            legacy_data_limitations: [
              "Orders committed before Phase 2 has no commit date (order_header.committed_at is NULL) and cannot be attributed to a historical salesman.",
              "Requests committed before Phase 2 shipped have no surviving PendingRequest/PendingLine row - AI-quality and turnaround data for them is permanently gone.",
              "~40,000 legacy ERP customers start with no salesman assignment (customer.salesman_id NULL) - no source of truth existed for who sells to whom.",
            ],
            metric_dictionary: METRIC_DICTIONARY,
          },
          {
            source: "catalog-service order_header/order_details/customer_ownership_history, backend pending_request",
            filters: {}, period: null, completeness: "PARTIAL",
            completeness_note: "This page's own job is to report completeness - see the completeness block above rather than treating this envelope's own status as the final word.",
          },
        ),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
