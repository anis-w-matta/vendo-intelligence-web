// Phase 6 "Salesman detail" - trends/portfolio/requests/rejection/
// turnaround/AI corrections for one salesman.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toOrdersParams, toRequestsParams } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";

export default async function salesmanDetailRoutes(app: FastifyInstance) {
  app.get(
    "/api/admin/intelligence/salesmen/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = FiltersQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
      }
      const f = { ...parsed.data, salesman: id };
      const authorization = request.headers.authorization!;
      const period = periodOf(f);

      try {
        const [roster, orderMetrics, requestMetrics, topCustomers] = await Promise.all([
          backendClient.listSalesmen(authorization, true),
          catalogClient.getSalesmenOrderMetrics(toOrdersParams(f)),
          backendClient.getSalesmenRequestMetrics(authorization, toRequestsParams(f)),
          catalogClient.getTopCustomers("order_count", 10, {
            date_from: f.date_from, date_to: f.date_to, salesman_id: id,
          }),
        ]);

        const salesman = roster.find((s) => s.login_id === id);
        if (!salesman) {
          return reply.code(404).send({ error: `no such salesman ${id}` });
        }
        const orders = orderMetrics.by_salesman.find((r) => r.salesman_id === id);
        const requests = requestMetrics.find((r) => r.salesman_id === id);

        return reply.send(
          envelope(
            {
              salesman_id: salesman.login_id,
              salesman_name: salesman.name,
              is_active: salesman.is_active,
              order_count: orders?.order_count ?? 0,
              order_line_count: orders?.order_line_count ?? 0,
              item_quantity: orders?.item_quantity ?? "0",
              customer_count: orders?.customer_count ?? 0,
              request_count: requests?.request_count ?? 0,
              rejection_rate: requests?.rejection_rate ?? null,
              median_turnaround_seconds: requests?.median_turnaround_seconds ?? null,
              ai_correction_rate: requests?.ai_correction_rate ?? null,
              top_customers: topCustomers,
            },
            {
              source: "catalog-service order_header/customer_ownership_history + backend pending_request/salesman",
              filters: { ...f }, period, completeness: "PARTIAL",
              completeness_note: `${orderMetrics.orders_excluded_missing_commit_date} order(s) excluded fleet-wide - no resolvable point-in-time salesman attribution`,
            },
          ),
        );
      } catch (err) {
        return handleUpstreamError(err, reply);
      }
    },
  );
}
