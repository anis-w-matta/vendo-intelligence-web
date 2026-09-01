import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toOrdersParams } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";

export default async function ordersRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/orders", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const period = periodOf(f);

    try {
      const [summary, histogram] = await Promise.all([
        catalogClient.getOrdersSummary(toOrdersParams(f)),
        catalogClient.getItemsPerOrderHistogram({
          date_from: f.date_from, date_to: f.date_to, cust_nb: f.customer, salesman_id: f.salesman,
        }),
      ]);

      return reply.send(
        envelope(
          { summary, items_per_order_histogram: histogram },
          {
            source: "catalog-service order_header/order_details",
            filters: { ...f }, period,
            completeness: summary.orders_excluded_missing_commit_date > 0 ? "PARTIAL" : "COMPLETE",
            completeness_note: summary.orders_excluded_missing_commit_date > 0
              ? `${summary.orders_excluded_missing_commit_date} order(s) excluded - no commit date recorded`
              : undefined,
          },
        ),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
