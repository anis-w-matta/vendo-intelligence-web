// Phase 14 (Gemini Intelligence Layer): the ONLY two routes in this repo
// that call Gemini. Both are strictly additive on top of Phase 13's
// already-computed, already-verified Insight objects (backend/src/lib/
// insightEngine.ts) - this file never computes a new business number, and
// never lets Gemini see anything beyond the bounded "facts" objects
// geminiClient.ts's buildInsightFacts() constructs from a single Insight.
//
// - POST /api/admin/intelligence/insights/explain: given ONE Insight
//   (the request body), returns a short plain-language explanation
//   grounded only in that insight's own fields. The frontend only ever
//   calls this on an explicit "Explain" click (see InsightsPage.tsx) -
//   never automatically on page load, per the phase's own requirement.
// - GET /api/admin/intelligence/briefing: synthesizes a short manager
//   briefing from the CURRENT real insight list. Re-runs the existing,
//   unmodified GET /api/admin/intelligence/insights route in-process via
//   app.inject() rather than duplicating its ~10-call upstream fetch
//   fan-out - this file has no upstream client calls of its own.
//
// Both routes ALWAYS respond 200 with a typed `status: "ok" |
// "unavailable"` body when the request itself was well-formed - a Gemini
// outage is an honest, expected state for this feature, never a 5xx that
// would make the rest of the page look broken (the phase's own "the
// platform must keep working ... never a broken page, never silently
// falling back to fabricated text" rule). See geminiClient.ts's own
// module docstring for the exact caching TTLs and why.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../plugins/auth.js";
import { buildInsightFacts, explainInsight, generateBriefing, type InsightFacts } from "../lib/geminiClient.js";
import type { Insight, InsightSeverity } from "../lib/insightEngine.js";

// Mirrors insightEngine.ts's `Insight` interface exactly - structural
// validation only, this route never re-derives or trusts anything beyond
// what's on the object itself. .strict() rejects any field not in this
// schema, so a caller can't smuggle unrelated data through this endpoint
// (belt-and-suspenders on top of buildInsightFacts() only ever reading
// the named fields below anyway).
const InsightBody = z
  .object({
    category: z.enum(["Sales", "Customer", "Item", "Operations", "AI", "Data Quality"]),
    severity: z.enum(["INFO", "WATCH", "WARNING", "CRITICAL"]),
    title: z.string(),
    explanation: z.string(),
    metric: z.string(),
    current_value: z.number(),
    baseline: z.number(),
    change_abs: z.number(),
    change_pct: z.number().nullable(),
    sample_size: z.number(),
    affected_entity: z.string(),
    timestamp: z.string(),
    drill_down: z.string(),
  })
  .strict();

// The briefing prompt stays short - the phase's own "minimal context"
// requirement - capped to the highest-severity insights rather than every
// insight the engine ever finds, sorted CRITICAL-first so a truncated
// list still leads with what matters most.
const BRIEFING_MAX_INSIGHTS = 20;
const SEVERITY_RANK: Record<InsightSeverity, number> = { CRITICAL: 3, WARNING: 2, WATCH: 1, INFO: 0 };

interface InsightsRouteResponse {
  insights: Insight[];
  status: string;
  note: string;
  last_updated: string;
}

export default async function geminiExplainRoutes(app: FastifyInstance) {
  app.post("/api/admin/intelligence/insights/explain", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = InsightBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid insight body", detail: parsed.error.flatten() });
    }

    // buildInsightFacts strips `timestamp`/`drill_down` before anything
    // is sent to Gemini - see geminiClient.ts's InsightFacts docstring.
    const facts: InsightFacts = buildInsightFacts(parsed.data);
    const result = await explainInsight(facts);

    if (result.status === "ok") {
      return reply.send({ status: "ok", explanation: result.text, cached: result.cached });
    }
    return reply.send({ status: "unavailable", reason: result.reason });
  });

  app.get("/api/admin/intelligence/briefing", { preHandler: requireAdmin }, async (request, reply) => {
    const authorization = request.headers.authorization!;

    // Re-run the existing, unmodified /insights route in-process (never a
    // second copy of its own upstream fan-out) - fleet-wide, no filters,
    // matching this endpoint's "daily manager briefing" scope.
    const insightsRes = await app.inject({
      method: "GET",
      url: "/api/admin/intelligence/insights",
      headers: { authorization },
    });
    if (insightsRes.statusCode !== 200) {
      return reply.send({ status: "unavailable", reason: "could not load current insights", insight_count: 0 });
    }

    const insightsBody = insightsRes.json() as InsightsRouteResponse;
    const sorted = [...insightsBody.insights].sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
    );
    const factsList = sorted.slice(0, BRIEFING_MAX_INSIGHTS).map(buildInsightFacts);

    const result = await generateBriefing(factsList);
    if (result.status === "ok") {
      return reply.send({
        status: "ok",
        briefing: result.text,
        insight_count: insightsBody.insights.length,
        generated_at: result.generatedAt,
        cached: result.cached,
      });
    }
    return reply.send({ status: "unavailable", reason: result.reason, insight_count: insightsBody.insights.length });
  });
}
