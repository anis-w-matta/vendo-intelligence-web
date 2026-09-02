// Phase 6 CUSTOMERS: assigned/unassigned counts + two separate top-
// customer rankings (order count, item quantity) - never a blended
// "customer value" metric, per the master prompt.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";

export default async function customersRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/customers", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const period = periodOf(f);
    const limit = f.limit ?? 20;

    try {
      const [summary, topByOrders, topByQuantity] = await Promise.all([
        catalogClient.getCustomersSummary(),
        catalogClient.getTopCustomers("order_count", limit, {
          date_from: f.date_from, date_to: f.date_to, salesman_id: f.salesman,
        }),
        catalogClient.getTopCustomers("item_quantity", limit, {
          date_from: f.date_from, date_to: f.date_to, salesman_id: f.salesman,
        }),
      ]);

      return reply.send(
        envelope(
          {
            summary,
            top_customers_by_order_count: topByOrders,
            top_customers_by_item_quantity: topByQuantity,
          },
          {
            source: "catalog-service customer/order_header/order_details",
            filters: { ...f }, period, completeness: "PARTIAL",
            completeness_note: "Shows assigned vs. unassigned customers only; an active/inactive breakdown isn't available yet",
          },
        ),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
