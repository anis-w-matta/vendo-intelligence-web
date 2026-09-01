// Phase 7 OPERATIONS page: backlog, turnaround histogram/percentiles,
// rejection by salesman. SLA compliance is intentionally omitted - no SLA
// threshold has been defined anywhere in this project, and fabricating
// one would violate the non-financial/data-honesty rule just as much as
// fabricating a number would.
//
// Phase 10 additions: status_counts and volume_over_time (both already
// present on backend's requests-summary response, just not previously
// forwarded here) power the request funnel and the volume-over-time
// chart; activity comes from the new admin-gated
// /admin/analytics/activity-summary aggregate (hour-of-day/event-type/
// day volume from ActivityLog, never raw log rows).
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
      const [summary, bySalesman, activity] = await Promise.all([
        backendClient.getRequestsSummary(authorization, toRequestsParams(f)),
        backendClient.getSalesmenRequestMetrics(authorization, toRequestsParams(f)),
        backendClient.getActivitySummary(authorization, {
          date_from: f.date_from,
          date_to: f.date_to,
          cust_nb: f.customer,
        }),
      ]);

      return reply.send(
        envelope(
          {
            status_counts: summary.status_counts,
            backlog: summary.backlog,
            turnaround: summary.turnaround,
            rejection: summary.rejection,
            rejection_by_salesman: bySalesman.map((s) => ({
              salesman_id: s.salesman_id,
              rejection_rate: s.rejection_rate,
              request_count: s.request_count,
            })),
            volume_over_time: summary.volume_over_time,
            activity,
            sla_compliance: null,
          },
          {
            source: "backend pending_request, backend activity_log", filters: { ...f }, period, completeness: "PARTIAL",
            completeness_note:
              "Turnaround for committed requests only reflects those committed after Phase 2 shipped. sla_compliance is null: no SLA threshold has been defined anywhere in this project. Activity hour-of-day counts (activity.by_hour) are bucketed in UTC, not business-local time.",
          },
        ),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
