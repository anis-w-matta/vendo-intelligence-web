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
    "Correction taxonomy and prediction-vs-final comparison: UNAVAILABLE. PendingLine stores only the final value after any human edit; no original AI prediction is preserved separately anywhere in the schema. Only whether a line was edited (yes/no) is known - that is what overall_correction_rate, by_confidence_bucket, by_item, by_intent, and trend below all report.",
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
              "Scoped to requests whose PendingLine rows still exist - only requests committed after Phase 2 shipped keep this data; anything committed before then has none left. Correction taxonomy and prediction-vs-final comparison are separately UNAVAILABLE - see correction_taxonomy below.",
          },
        ),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
