// Phase 7 AI QUALITY - confidence buckets vs. actual correction rate.
// "Do not assume higher confidence means better performance without
// evidence" and "do not claim AI accuracy without defensible ground
// truth" (07_phase_7_operations_ai.md) - this endpoint reports observed
// correction rates only, never an invented accuracy figure.
//
// Phase 11 adds hotspots (by item, by intent) and a correction-rate trend,
// plus an explicit data-honesty gap: PendingLine stores only the FINAL
// (possibly human-edited) item_nb/qty/uom, plus a single `operator_edited`
// boolean - there is no stored original AI prediction distinct from the
// final value anywhere in this schema (confirmed against every
// PendingRequest/PendingLine construction site in the Python backend's
// app/pipeline.py and app/services/draft_builder.py; raw_model_output is
// request-level parse metadata, never a per-line predicted-vs-final
// snapshot - see app/services/analytics.py's module docstring for the
// full reasoning). So "AI prediction -> human edit -> final value" and a
// correction taxonomy (item mismatch / quantity / UOM / intent / other)
// are NOT reconstructable from current data - only "was this line edited
// at all" is known. correction_taxonomy below is rendered as an explicit,
// visible UNAVAILABLE gap, never fabricated.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toRequestsParams } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import { handleUpstreamError } from "../lib/errors.js";

const CORRECTION_TAXONOMY_GAP = {
  status: "UNAVAILABLE" as const,
  note:
    "Not available: we don't currently keep a record of what the AI originally suggested before a human corrected it - only whether a line was edited. The correction-rate figures reflect that yes/no signal.",
};

export default async function aiQualityRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/ai-quality", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const authorization = request.headers.authorization!;
    const period = periodOf(f);
    const requestsParams = toRequestsParams(f);
    // by-intent and trend only accept this subset upstream (no
    // status/intent filter - see app/api/analytics.py's
    // ai_quality_by_intent/ai_quality_trend).
    const intentTrendParams = {
      date_from: requestsParams.date_from,
      date_to: requestsParams.date_to,
      salesman_id: requestsParams.salesman_id,
      cust_nb: requestsParams.cust_nb,
    };

    try {
      const [summary, byItem, byIntent, trend] = await Promise.all([
        backendClient.getAiQualitySummary(authorization, requestsParams),
        backendClient.getAiQualityByItem(authorization, requestsParams),
        backendClient.getAiQualityByIntent(authorization, intentTrendParams),
        backendClient.getAiQualityTrend(authorization, intentTrendParams),
      ]);
      return reply.send(
        envelope(
          {
            ...summary,
            by_item: byItem,
            by_intent: byIntent,
            trend,
            correction_taxonomy: CORRECTION_TAXONOMY_GAP,
          },
          {
            source: "backend pending_request_line", filters: { ...f }, period, completeness: "PARTIAL",
            completeness_note:
              "Only includes requests processed after our AI-review tracking upgrade; earlier requests have no data left. Correction taxonomy and prediction-vs-final comparison are separately unavailable - see below.",
          },
        ),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
