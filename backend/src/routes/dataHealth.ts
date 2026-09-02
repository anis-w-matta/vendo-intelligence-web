// Data Health and Trust Center - surfaces data-quality caveats in plain
// language for a sales-manager audience; never hide limitations, but never
// expose internal schema/implementation detail to explain them either.
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
      const unassignedCustomers = catalogHealth.total_customers - catalogHealth.customers_with_salesman;

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
                note: "Guaranteed by the system - this can never happen.",
              },
              requests_with_committed_order_lineage: {
                count: committedRequests,
                total: totalRequests,
                pct: pct(committedRequests, totalRequests),
                status: "PARTIAL",
                note: "Only available for requests processed after our request-tracking upgrade; earlier records were not retained.",
              },
              order_details_orphaned: {
                violations: catalogHealth.order_details_orphaned,
                total: catalogHealth.total_order_details,
                status: "COMPLETE",
                note: "Guaranteed by the system - every order line is always linked to a real order.",
              },
              order_details_invalid_item_ref: {
                violations: catalogHealth.order_details_invalid_item_ref,
                total: catalogHealth.total_order_details,
                status: catalogHealth.order_details_invalid_item_ref === 0 ? "COMPLETE" : "PARTIAL",
                note: "A small number of order lines can reference an item that's no longer in the catalog, usually a discontinued or renamed item from an older system that was migrated in.",
              },
              orders_with_no_lines: {
                count: catalogHealth.total_orders - catalogHealth.orders_with_no_lines,
                total: catalogHealth.total_orders,
                pct: pct(catalogHealth.total_orders - catalogHealth.orders_with_no_lines, catalogHealth.total_orders),
                status: catalogHealth.orders_with_no_lines === 0 ? "COMPLETE" : "PARTIAL",
                note: `${catalogHealth.orders_with_no_lines} order(s) have no line items recorded - see the Reconciliation section below. This doesn't necessarily indicate an error.`,
              },
              customers_with_salesman: {
                count: catalogHealth.customers_with_salesman,
                total: catalogHealth.total_customers,
                pct: pct(catalogHealth.customers_with_salesman, catalogHealth.total_customers),
                status: catalogHealth.customers_with_salesman === catalogHealth.total_customers ? "COMPLETE" : "PARTIAL",
                note: unassignedCustomers > 0
                  ? `${unassignedCustomers.toLocaleString()} customer(s) don't have a salesman assigned yet - see Known Limitations below.`
                  : "Every customer currently has a salesman assigned.",
              },
            },
            duplicate_orders: {
              groups: catalogHealth.duplicate_order_groups,
              heuristic: "Orders sharing the same customer and the same completion time to the second.",
              caveat:
                "A deliberately narrow, conservative check, not an exhaustive scan - it only flags orders sharing the exact same customer and the same completion time to the second. As a result this figure likely under-counts real duplicates rather than risk mislabeling legitimate back-to-back orders. Treat it as a starting point to investigate, not a complete count of duplicate orders.",
            },
            reconciliation: {
              headers_details_quantity: {
                total_order_headers: catalogHealth.total_orders,
                order_headers_with_at_least_one_line: catalogHealth.total_orders - catalogHealth.orders_with_no_lines,
                order_headers_with_no_lines: catalogHealth.orders_with_no_lines,
                total_order_detail_rows: catalogHealth.total_order_details,
                note: "An order with no line items is unusual and worth investigating, but isn't automatically treated as an error.",
              },
              requests_vs_committed_orders: {
                requests_with_committed_order_lineage: committedRequests,
                total_requests: totalRequests,
                orders_with_committed_at: catalogHealth.orders_with_committed_at,
                total_orders: catalogHealth.total_orders,
                note: "These two figures come from separate systems and aren't expected to match - a gap between them isn't, on its own, evidence of a problem. Orders imported from an older system were never routed through the request queue, so the order count is expected to exceed the request count, often by a large margin.",
              },
            },
            legacy_data_limitations: [
              // These first two describe a fixed historical fact (rows from
              // before our tracking upgrades, which can never retroactively
              // gain the data that upgrade started recording) - permanently
              // true regardless of what changes going forward, safe to
              // state unconditionally.
              "Orders placed before our order-tracking upgrade have no completion date on file and cannot be attributed to a historical salesman.",
              "Requests processed before our request-tracking upgrade have no surviving detail record - AI-quality and turnaround data for them is permanently gone.",
              // Unlike the two above, customer-salesman assignment CAN
              // change - a hardcoded claim here would silently go stale and
              // contradict the live customers_with_salesman completeness
              // count above the moment any assignment happened. Only ever
              // state what's true right now.
              ...(unassignedCustomers > 0
                ? [`${unassignedCustomers.toLocaleString()} of ${catalogHealth.total_customers.toLocaleString()} customers currently have no salesman assignment - typically customers imported from an older system with no record of who sells to whom.`]
                : []),
            ],
            metric_dictionary: METRIC_DICTIONARY,
          },
          {
            source: "catalog-service order_header/order_details/customer_ownership_history, backend pending_request",
            filters: {}, period: null, completeness: "PARTIAL",
            completeness_note: "See the completeness breakdown above for full detail.",
          },
        ),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
