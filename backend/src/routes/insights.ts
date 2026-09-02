// Phase 13 (Insight Engine): the dedicated /insights page. This does NOT
// recompute any detection logic of its own - it re-fetches the same
// bounded upstream data Phase 12's overview.ts (Attention Center) and
// Phase 11's aiQuality.ts and Phase 16's dataHealth.ts already fetch (each
// route independently calling catalogClient/backendClient, per this
// codebase's established pattern - see overview.ts's own note on why
// routes don't share request-scoped state), then reshapes the results
// through backend/src/lib/insightEngine.ts's Insight schema with a
// documented severity classification. See insightEngine.ts for the full
// severity-threshold documentation and the "never fabricate, never
// recompute a detection rule" discipline this route follows.
//
// Category coverage (see `NOTE` below for the exact prose returned to the
// client):
//  - Sales: fleet order-volume / fleet item-quantity baseline deviations
//    (Phase 12) + per-salesman benchmarking flags vs. the fleet average
//    (Phase 7).
//  - Operations: request-volume baseline deviation + rejection-rate vs.
//    previous period (Phase 12).
//  - Customer: ordering-gap + order-quantity-anomaly signals (Phase 8),
//    scoped to the top TOP_CUSTOMER_LIMIT customers by order_count - the
//    same bounded scope overview.ts's Attention Center already uses, and
//    the same reasoning (never loop the ~43,000-customer fleet).
//  - Item: quantity-trend signal only (Phase 9's detectQuantityTrendSignal,
//    ported server-side - see insightEngine.ts), scoped to the top
//    TOP_ITEM_LIMIT items by quantity. Phase 9's other three item signals
//    (concentrated-customer, low-penetration, high-frequency-low-quantity)
//    are NOT ported here - each needs either a per-item customer matrix or
//    a same-population comparison set that would multiply this route's
//    already-sizeable bounded fetch count; ItemDetailPage computes them
//    directly for any one item. A deliberate scope-down, not a silent gap.
//  - AI: item/intent correction-rate hotspots vs. the fleet-wide overall
//    correction rate (Phase 11), gated by both the upstream endpoint's own
//    minimum-sample-size gate and this route's own AI_MIN_SAMPLE_SIZE
//    floor. The correction-rate trend series is not surfaced as its own
//    insight this pass.
//  - Data Quality: nonzero invalid-item-reference lines, orders with zero
//    lines, duplicate-order groups, and customers with no salesman
//    assignment (Phase 16).
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toOrdersParams, toRequestsParams } from "../lib/filters.js";
import * as backendClient from "../lib/backendClient.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";
import { detectSignals, type OrderHistoryPoint, type ActivitySignal } from "../lib/customerActivity.js";
import { fleetBaselineInsights, rejectionInsight, customerGapInsight, aggregateDailyVolume, type DailyPoint } from "./overview.js";
import {
  insightFromAttention,
  insightFromCustomerQuantityAnomaly,
  detectItemQuantityTrendSignal,
  insightFromItemQuantityTrend,
  insightsFromSalesmanBenchmark,
  insightsFromAiQualityHotspots,
  insightsFromDataHealth,
  type Insight,
  type AttentionInsightLike,
} from "../lib/insightEngine.js";

// Bounded scopes - never loop the full customer/item fleet. Mirrors
// overview.ts's ATTENTION_TOP_CUSTOMER_LIMIT (10) for the customer signals
// so /insights and the Command Center's Attention Center agree on which
// customers were even considered; TOP_ITEM_LIMIT is this route's own,
// deliberately small bound for the one Item signal it computes.
const TOP_CUSTOMER_LIMIT = 10;
const TOP_ITEM_LIMIT = 5;

// This route's own defensive floor on top of whatever minimum-sample-size
// gate the FastAPI ai-quality-by-item/-by-intent endpoints already apply
// server-side (see aiQuality.ts's module docstring) - belt-and-suspenders,
// consistent with this phase's "sufficient sample size" rule.
const AI_MIN_SAMPLE_SIZE = 3;

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export default async function insightsRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/insights", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const authorization = request.headers.authorization!;
    const nowIso = new Date().toISOString();

    try {
      const [
        roster,
        salesmenOrderMetrics,
        salesmenRequestMetrics,
        dailyOrdersTrend,
        requestsSummary,
        topCustomers,
        topItemsByQuantity,
        aiSummary,
        aiByItem,
        aiByIntent,
        catalogHealth,
      ] = await Promise.all([
        backendClient.listSalesmen(authorization),
        catalogClient.getSalesmenOrderMetrics(toOrdersParams(f)),
        backendClient.getSalesmenRequestMetrics(authorization, toRequestsParams(f)),
        catalogClient.getOrdersTrend({ ...toOrdersParams(f), granularity: "day" }),
        backendClient.getRequestsSummary(authorization, toRequestsParams(f)),
        catalogClient.getTopCustomers("order_count", TOP_CUSTOMER_LIMIT, {
          date_from: f.date_from, date_to: f.date_to, salesman_id: f.salesman,
        }),
        catalogClient.getTopItems("quantity", TOP_ITEM_LIMIT, {
          date_from: f.date_from, date_to: f.date_to, category: f.category, salesman_id: f.salesman,
        }),
        backendClient.getAiQualitySummary(authorization, toRequestsParams(f)),
        backendClient.getAiQualityByItem(authorization, toRequestsParams(f)),
        backendClient.getAiQualityByIntent(authorization, {
          date_from: f.date_from, date_to: f.date_to, salesman_id: f.salesman, cust_nb: f.customer,
        }),
        catalogClient.getCatalogDataHealth(),
      ]);

      const [customerHistories, itemTrends] = await Promise.all([
        Promise.all(topCustomers.map((c) => catalogClient.getCustomerOrderHistory(c.cust_nb))),
        Promise.all(topItemsByQuantity.map((i) => catalogClient.getOrdersTrend({ item_nb: i.item_nb }))),
      ]);

      const insights: Insight[] = [];

      // ---- Sales / Operations (Phase 12 fleet baseline-deviation + rejection) ----
      const orderVolumeSeries: DailyPoint[] = dailyOrdersTrend.points.map((p) => ({ bucket: p.bucket, value: p.order_count }));
      const itemQuantitySeries: DailyPoint[] = dailyOrdersTrend.points.map((p) => ({ bucket: p.bucket, value: Number(p.item_quantity) }));
      const requestVolumeSeries = aggregateDailyVolume(requestsSummary.volume_over_time.map((v) => ({ day: v.day, count: v.count })));

      const attentionLikeInsights: AttentionInsightLike[] = [
        ...fleetBaselineInsights(orderVolumeSeries, "order_volume", "fleet daily order count", "catalog-service order_header, daily granularity"),
        ...fleetBaselineInsights(itemQuantitySeries, "quantity", "fleet daily item quantity", "catalog-service order_details, daily granularity"),
        ...fleetBaselineInsights(requestVolumeSeries, "request", "daily request volume", "backend pending_request, daily granularity (summed across all statuses)"),
      ];
      const rejection = rejectionInsight(
        requestsSummary.rejection.rejection_rate,
        requestsSummary.rejection.previous_period_rejection_rate,
        periodOf(f) ?? { from: null, to: null },
        requestsSummary.rejection.sample_size,
      );
      if (rejection) attentionLikeInsights.push(rejection);

      // ---- Customer (Phase 8, top-N customers only) ----
      for (let i = 0; i < topCustomers.length; i++) {
        const c = topCustomers[i];
        const history = customerHistories[i];
        if (history.length < 2) continue; // detectSignals needs >=2 orders for a long_gap signal
        const historyPoints: OrderHistoryPoint[] = history.map((h) => ({
          committedAt: h.committed_at, itemQuantity: Number(h.item_quantity),
        }));
        const signals: ActivitySignal[] = detectSignals(historyPoints);
        const gap = signals.find((s) => s.type === "long_gap");
        if (gap && gap.type === "long_gap") {
          attentionLikeInsights.push(customerGapInsight(c.cust_nb, c.customer_name, gap, history, nowIso));
        }
        const anomaly = signals.find((s) => s.type === "quantity_anomaly");
        if (anomaly && anomaly.type === "quantity_anomaly") {
          insights.push(insightFromCustomerQuantityAnomaly(c.cust_nb, c.customer_name, anomaly, history.length, nowIso));
        }
      }

      for (const a of attentionLikeInsights) insights.push(insightFromAttention(a, nowIso));

      // ---- Item (Phase 9's quantity-trend signal only, top-N items by quantity) ----
      for (let i = 0; i < topItemsByQuantity.length; i++) {
        const item = topItemsByQuantity[i];
        const trend = itemTrends[i];
        const points = trend.points.map((p) => ({ bucket: p.bucket, value: Number(p.item_quantity) }));
        const signal = detectItemQuantityTrendSignal(points);
        if (signal) insights.push(insightFromItemQuantityTrend(item.item_nb, item.item_desc, signal, points.length, nowIso));
      }

      // ---- Sales (Phase 7 per-salesman benchmarking flags) ----
      const orderByLoginId = new Map(salesmenOrderMetrics.by_salesman.map((r) => [r.salesman_id, r]));
      const requestByLoginId = new Map(salesmenRequestMetrics.map((r) => [r.salesman_id, r]));
      const activeSalesmen = roster.filter((s) => s.role === "salesman" && s.is_active);
      const fleetOrderCounts: number[] = [];
      const fleetCustomerCounts: number[] = [];
      const fleetRejectionRates: number[] = [];
      const fleetTurnaroundSeconds: number[] = [];
      for (const s of activeSalesmen) {
        const o = orderByLoginId.get(s.login_id);
        const r = requestByLoginId.get(s.login_id);
        if (o) {
          fleetOrderCounts.push(o.order_count);
          fleetCustomerCounts.push(o.customer_count);
        }
        if (r?.rejection_rate !== null && r?.rejection_rate !== undefined) fleetRejectionRates.push(r.rejection_rate);
        if (r?.median_turnaround_seconds !== null && r?.median_turnaround_seconds !== undefined) {
          fleetTurnaroundSeconds.push(r.median_turnaround_seconds);
        }
      }
      const fleetAverage = {
        sample_size: activeSalesmen.length,
        order_count: mean(fleetOrderCounts),
        customer_count: mean(fleetCustomerCounts),
        rejection_rate: mean(fleetRejectionRates),
        median_turnaround_seconds: median(fleetTurnaroundSeconds),
      };
      for (const s of activeSalesmen) {
        const o = orderByLoginId.get(s.login_id);
        const r = requestByLoginId.get(s.login_id);
        insights.push(
          ...insightsFromSalesmanBenchmark(
            {
              salesman_id: s.login_id,
              salesman_name: s.name,
              order_count: o?.order_count ?? null,
              customer_count: o?.customer_count ?? null,
              rejection_rate: r?.rejection_rate ?? null,
              median_turnaround_seconds: r?.median_turnaround_seconds ?? null,
              fleet_average: fleetAverage,
            },
            nowIso,
          ),
        );
      }

      // ---- AI (Phase 11 hotspots) ----
      const gatedByItem = aiByItem.filter((it) => it.sample_size >= AI_MIN_SAMPLE_SIZE);
      const gatedByIntent = aiByIntent.filter((it) => it.sample_size >= AI_MIN_SAMPLE_SIZE);
      insights.push(...insightsFromAiQualityHotspots(aiSummary.overall_correction_rate, gatedByItem, gatedByIntent, nowIso));

      // ---- Data Quality (Phase 16) ----
      insights.push(...insightsFromDataHealth(catalogHealth, nowIso));

      const note =
        `${insights.length} signal(s) found across Sales, Customers (based on the top ${TOP_CUSTOMER_LIMIT} by ` +
        `order volume), Items (based on the top ${TOP_ITEM_LIMIT} by quantity - see an item's own page for ` +
        `further signals), Operations, AI Quality, and Data Quality. An empty category means nothing needs ` +
        `attention there right now, not that it hasn't been checked.`;

      return reply.send({
        insights,
        status: "PARTIAL",
        note,
        last_updated: nowIso,
      });
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
