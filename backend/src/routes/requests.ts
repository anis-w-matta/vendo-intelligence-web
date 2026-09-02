// Phase 7 OPERATIONS: request funnel/volume/backlog/turnaround/rejection.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toRequestsParams } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import { handleUpstreamError } from "../lib/errors.js";

export default async function requestsRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/requests", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const authorization = request.headers.authorization!;
    const period = periodOf(f);

    try {
      const summary = await backendClient.getRequestsSummary(authorization, toRequestsParams(f));
      return reply.send(
        envelope(summary, {
          source: "backend pending_request/pending_request_line",
          filters: { ...f }, period, completeness: "PARTIAL",
          completeness_note:
            "Turnaround and rejection figures only reflect requests processed after our request-tracking upgrade.",
        }),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
