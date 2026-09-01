// Phase 7 AI QUALITY - confidence buckets vs. actual correction rate.
// "Do not assume higher confidence means better performance without
// evidence" and "do not claim AI accuracy without defensible ground
// truth" (07_phase_7_operations_ai.md) - this endpoint reports observed
// correction rates only, never an invented accuracy figure.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toRequestsParams } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import { handleUpstreamError } from "../lib/errors.js";

export default async function aiQualityRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/ai-quality", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const authorization = request.headers.authorization!;
    const period = periodOf(f);

    try {
      const summary = await backendClient.getAiQualitySummary(authorization, toRequestsParams(f));
      return reply.send(
        envelope(summary, {
          source: "backend pending_request_line", filters: { ...f }, period, completeness: "PARTIAL",
          completeness_note:
            "Scoped to requests whose PendingLine rows still exist - only requests committed after Phase 2 shipped keep this data; anything committed before then has none left.",
        }),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
