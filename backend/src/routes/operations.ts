// Phase 7 OPERATIONS page: backlog, turnaround histogram/percentiles,
// rejection by salesman. SLA compliance is intentionally omitted - no SLA
// threshold has been defined anywhere in this project, and fabricating
// one would violate the non-financial/data-honesty rule just as much as
// fabricating a number would.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toRequestsParams } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import { handleUpstreamError } from "../lib/errors.js";

export default async function operationsRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/operations", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const authorization = request.headers.authorization!;
    const period = periodOf(f);

    try {
      const [summary, bySalesman] = await Promise.all([
        backendClient.getRequestsSummary(authorization, toRequestsParams(f)),
        backendClient.getSalesmenRequestMetrics(authorization, toRequestsParams(f)),
      ]);

      return reply.send(
        envelope(
          {
            backlog: summary.backlog,
            turnaround: summary.turnaround,
            rejection: summary.rejection,
            rejection_by_salesman: bySalesman.map((s) => ({
              salesman_id: s.salesman_id,
              rejection_rate: s.rejection_rate,
              request_count: s.request_count,
            })),
            sla_compliance: null,
          },
          {
            source: "backend pending_request", filters: { ...f }, period, completeness: "PARTIAL",
            completeness_note:
              "Turnaround for committed requests only reflects those committed after Phase 2 shipped. sla_compliance is null: no SLA threshold has been defined anywhere in this project.",
          },
        ),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
