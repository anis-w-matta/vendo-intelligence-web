// Phase 6 "Customer 360" - owner, orders, order lines, item quantity,
// average items/order, request activity, last activity, trend, plus the
// full point-in-time ownership history (Phase 2's customer_ownership_history).
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toRequestsParams } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";

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
        const [summary, ownershipHistory, requestActivity] = await Promise.all([
          catalogClient.getCustomerSummary(id),
          catalogClient.getCustomerOwnershipHistory(id),
          backendClient.getRequestsSummary(authorization, toRequestsParams(f)),
        ]);

        return reply.send(
          envelope(
            {
              customer: summary,
              ownership_history: ownershipHistory,
              request_activity: {
                status_counts: requestActivity.status_counts,
                backlog: requestActivity.backlog,
              },
            },
            {
              source: "catalog-service customer/order_header + customer_ownership_history, backend pending_request",
              filters: { ...f }, period, completeness: "COMPLETE",
            },
          ),
        );
      } catch (err) {
        return handleUpstreamError(err, reply);
      }
    },
  );
}
