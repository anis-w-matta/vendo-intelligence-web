// Phase 8's real insight engine (evidence-backed, with baselines, moving
// averages, and minimum sample sizes - see 08_phase_8_insights.md) is
// built in a later phase. This is an honest stub, not a fake/shallow
// version: empty list, status UNAVAILABLE, and a clear note - chosen
// deliberately over rushing something that would risk looking like a
// real insight without the statistical safeguards the master prompt
// requires for one. See the Phase 3 plan's "insights scope" decision.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery } from "../lib/filters.js";

export default async function insightsRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/insights", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    return reply.send({
      insights: [],
      status: "UNAVAILABLE",
      note: "The insights engine ships in Phase 8 (see 08_phase_8_insights.md). Never fabricated here - an empty list, not invented findings.",
      last_updated: new Date().toISOString(),
    });
  });
}
