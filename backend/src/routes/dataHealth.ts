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
              order_details_orphaned: {
                violations: catalogHealth.order_details_orphaned,
                total: catalogHealth.total_order_details,
                status: "COMPLETE",
                note: "order_details has a real DB ForeignKeyConstraint to order_header - a line referencing a nonexistent order is structurally impossible, not just observed to be zero.",
              },
              order_details_invalid_item_ref: {
                violations: catalogHealth.order_details_invalid_item_ref,
                total: catalogHealth.total_order_details,
                status: catalogHealth.order_details_invalid_item_ref === 0 ? "COMPLETE" : "PARTIAL",
                note: "Unlike the order_header link, there is no DB foreign key from order_details to item - a line can reference an item_nb no longer (or never) present in the catalog, most likely a discontinued/renamed item from the legacy ERP import. This is a real query result, not a structural guarantee.",
              },
              orders_with_no_lines: {
                count: catalogHealth.total_orders - catalogHealth.orders_with_no_lines,
                total: catalogHealth.total_orders,
                pct: pct(catalogHealth.total_orders - catalogHealth.orders_with_no_lines, catalogHealth.total_orders),
                status: catalogHealth.orders_with_no_lines === 0 ? "COMPLETE" : "PARTIAL",
                note: `${catalogHealth.orders_with_no_lines} order header(s) have zero order_details rows - a Header vs. Details reconciliation check, not necessarily an error (see the Reconciliation section below).`,
              },
              customers_with_salesman: {
                count: catalogHealth.customers_with_salesman,
                total: catalogHealth.total_customers,
                pct: pct(catalogHealth.customers_with_salesman, catalogHealth.total_customers),
                status: catalogHealth.customers_with_salesman === catalogHealth.total_customers ? "COMPLETE" : "PARTIAL",
                note: "~40,000 legacy ERP customers were imported with no salesman assignment at all - see Known Legacy Limitations.",
              },
            },
            duplicate_orders: {
              groups: catalogHealth.duplicate_order_groups,
              heuristic: "Orders sharing the same customer (cust_nb) and the same order_header.committed_at timestamp to the second.",
              caveat:
                "This is a deliberately narrow, conservative heuristic - not an exhaustive duplicate-order scan. It only flags orders sharing the exact same customer and a to-the-second commit timestamp: two genuinely independent commits landing at literally the same second is implausible, and same-key retried commits are already prevented elsewhere (commit_intent_id's unique constraint). As a result this number is expected to UNDER-count real duplicates - for example, two legacy ERP-imported rows for the same sale that landed a few seconds apart would not be caught - rather than risk mislabeling legitimate back-to-back orders as duplicates. Treat this as a lower bound / narrow signal to investigate, never as a complete count of duplicate orders.",
            },
            reconciliation: {
              headers_details_quantity: {
                total_order_headers: catalogHealth.total_orders,
                order_headers_with_at_least_one_line: catalogHealth.total_orders - catalogHealth.orders_with_no_lines,
                order_headers_with_no_lines: catalogHealth.orders_with_no_lines,
                total_order_detail_rows: catalogHealth.total_order_details,
                note: "Plain counts, not a computed match/mismatch verdict. An order header with zero order_details rows is unusual and worth investigating, but orders_with_no_lines above (not this section) is the honest signal for that - this section only lays the raw counts side by side.",
              },
              requests_vs_committed_orders: {
                requests_with_committed_order_lineage: committedRequests,
                total_requests: totalRequests,
                orders_with_committed_at: catalogHealth.orders_with_committed_at,
                total_orders: catalogHealth.total_orders,
                note: 'These two counts come from independent systems via independent commit paths and are NOT expected to match - a gap between them is not, by itself, evidence of a problem. "Requests with committed order lineage" counts backend PendingRequest rows with status="committed"; "orders with a commit date" counts catalog-service order_header rows that have a committed_at timestamp. A live voice-order commit creates both a committed PendingRequest and an order_header row, but the legacy ERP import wrote order_header rows directly with no PendingRequest ever existing for them - so the order_header count is expected to exceed the committed-request count, often by a large margin. This is a side-by-side of two real counts from two systems, not a join of the underlying datasets - there is no cheap way to link an individual order back to the request that produced it from here.',
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
