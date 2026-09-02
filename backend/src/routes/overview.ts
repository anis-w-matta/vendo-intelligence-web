// Command Center (Phase 5) - "What is happening across VeNdO?" No
// revenue/price/order-value KPI anywhere below, per the master prompt's
// non-financial rule.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toOrdersParams, toRequestsParams } from "../lib/filters.js";
import { metric, envelope, type CompletenessStatus, type Period } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";
import { detectSignals, type OrderHistoryPoint, type LongGapSignal } from "../lib/customerActivity.js";

// ---------------------------------------------------------------------
// Phase 12 (Anomaly Detection Engine) - Attention Center assembly.
//
// Every insight below carries current value, baseline value, absolute +
// percentage difference, the date range each side covers, the sample
// size behind the baseline, and a `reason` string built only from those
// numbers - never a bare "anomaly detected" (this phase's own explicit
// rule: "Administrators must be able to understand why an anomaly was
// generated. Do not build an opaque black box.").
//
// Deterministic/statistical only - no ML, matching every prior phase's
// signal modules (frontend/src/lib/benchmarking.ts Phase 7, ../lib/
// customerActivity.ts Phase 8, frontend/src/lib/itemSignals.ts Phase 9,
// frontend/src/lib/operationalPressure.ts Phase 10). Every `reason` reads
// as "Investigate: ..." - an observation, never a verdict.
// ---------------------------------------------------------------------

export type AttentionCategory = "order_volume" | "quantity" | "request" | "rejection" | "customer_ordering_gap";

export interface AttentionInsight {
  id: string;
  category: AttentionCategory;
  reason: string;
  current_value: number;
  baseline_value: number;
  difference_abs: number;
  difference_pct: number;
  current_period: Period;
  baseline_period: Period;
  sample_size: number;
  source: string;
  subject?: { cust_nb: string; customer_name: string };
}

// -- Fleet baseline-deviation arithmetic (order volume / quantity / request
// volume) --------------------------------------------------------------
// This is the same arithmetic as frontend/src/lib/anomalyBaseline.ts,
// kept intentionally equivalent. It is duplicated here, not imported,
// because this backend route and that frontend module are two different
// npm packages / TypeScript projects (separate rootDir, separate
// node_modules, see backend/tsconfig.json) - a backend route cannot
// import a frontend/src/lib module. frontend/src/lib/itemSignals.ts
// already documents this same split when it duplicates
// customerActivity.ts's ratio constants instead of importing them; this
// is the same pattern in the opposite direction. Any change to the
// thresholds/behavior here should be mirrored there, and vice versa.

// `export`ed (beyond what this route itself needs) so backend/src/routes/
// insights.ts (Phase 13) can reuse this exact arithmetic/fetch-shaping
// rather than re-duplicating it a second time - a plain same-package
// import, not the frontend/backend module-graph split documented above
// (that split is only ever backend-vs-frontend; two backend routes are
// the same TypeScript project and can import each other freely).
export interface DailyPoint {
  bucket: string; // "YYYY-MM-DD"
  value: number;
}

type BaselineWindowDays = 7 | 30;
const BASELINE_WINDOWS: readonly BaselineWindowDays[] = [7, 30];
const MIN_SAMPLE_SIZE: Record<BaselineWindowDays, number> = { 7: 5, 30: 20 };
const DEVIATION_THRESHOLD_PCT = 30; // +-30%, see anomalyBaseline.ts for full rationale

function parseDayMs(bucket: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bucket)) return null;
  const ms = new Date(`${bucket}T00:00:00Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function meanOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

interface BaselineDeviation {
  windowDays: BaselineWindowDays;
  currentValue: number;
  currentBucket: string;
  baselineValue: number;
  baselineFrom: string;
  baselineTo: string;
  sampleSize: number;
  differenceAbs: number;
  differencePct: number;
  direction: "above" | "below";
}

function detectBaselineDeviation(series: DailyPoint[], windowDays: BaselineWindowDays): BaselineDeviation | null {
  const parsed = series
    .map((p) => ({ ms: parseDayMs(p.bucket), bucket: p.bucket, value: p.value }))
    .filter((p): p is { ms: number; bucket: string; value: number } => p.ms !== null)
    .sort((a, b) => a.ms - b.ms);
  if (parsed.length < 2) return null;

  const current = parsed[parsed.length - 1];
  const windowStartMs = current.ms - windowDays * 86_400_000;
  const windowPoints = parsed.slice(0, -1).filter((p) => p.ms >= windowStartMs && p.ms < current.ms);

  const sampleSize = windowPoints.length;
  if (sampleSize < MIN_SAMPLE_SIZE[windowDays]) return null;

  const baselineValue = meanOf(windowPoints.map((p) => p.value));
  if (baselineValue === null || baselineValue <= 0) return null;

  const differenceAbs = current.value - baselineValue;
  const differencePct = (differenceAbs / baselineValue) * 100;
  if (Math.abs(differencePct) <= DEVIATION_THRESHOLD_PCT) return null;

  return {
    windowDays,
    currentValue: current.value,
    currentBucket: current.bucket,
    baselineValue,
    baselineFrom: windowPoints[0].bucket,
    baselineTo: windowPoints[windowPoints.length - 1].bucket,
    sampleSize,
    differenceAbs,
    differencePct,
    direction: differenceAbs > 0 ? "above" : "below",
  };
}

export function fleetBaselineInsights(
  series: DailyPoint[],
  category: "order_volume" | "quantity" | "request",
  metricLabel: string,
  source: string,
): AttentionInsight[] {
  return BASELINE_WINDOWS.map((windowDays) => detectBaselineDeviation(series, windowDays))
    .filter((d): d is BaselineDeviation => d !== null)
    .map((d) => {
      const sign = d.differencePct >= 0 ? "+" : "";
      const reason =
        `Investigate: current ${metricLabel} ${formatNum(d.currentValue)}; ` +
        `baseline (${d.windowDays}-day avg) ${formatNum(d.baselineValue)}; ` +
        `${sign}${d.differencePct.toFixed(1)}%; unusually ${d.direction === "above" ? "high" : "low"} ${metricLabel}.`;
      return {
        id: `${category}_${d.windowDays}d_${d.currentBucket}`,
        category,
        reason,
        current_value: d.currentValue,
        baseline_value: d.baselineValue,
        difference_abs: d.differenceAbs,
        difference_pct: d.differencePct,
        current_period: { from: d.currentBucket, to: d.currentBucket },
        baseline_period: { from: d.baselineFrom, to: d.baselineTo },
        sample_size: d.sampleSize,
        source,
      };
    });
}

export function aggregateDailyVolume(points: { day: string; count: number }[]): DailyPoint[] {
  const byDay = new Map<string, number>();
  for (const p of points) {
    const day = p.day.slice(0, 10); // normalize a possible timestamp to "YYYY-MM-DD"
    byDay.set(day, (byDay.get(day) ?? 0) + p.count);
  }
  return Array.from(byDay.entries()).map(([bucket, value]) => ({ bucket, value }));
}

// -- Rejection-vs-previous-period signal ---------------------------------
// Re-derives frontend/src/lib/operationalPressure.ts's
// detectRejectionAboveBaseline (Phase 10) rather than importing it, for
// the same backend/frontend module-boundary reason documented above.
// Kept arithmetic-equivalent: ratio = current / previous, flag only past
// (not at) REJECTION_BASELINE_RATIO.
const REJECTION_BASELINE_RATIO = 1.5;

export function rejectionInsight(
  currentRate: number | null,
  previousRate: number | null,
  currentPeriod: Period,
  sampleSize: number,
): AttentionInsight | null {
  if (currentRate === null || previousRate === null || previousRate <= 0) return null;
  const ratio = currentRate / previousRate;
  if (ratio <= REJECTION_BASELINE_RATIO) return null;
  const differenceAbs = currentRate - previousRate;
  const differencePct = (differenceAbs / previousRate) * 100;
  return {
    id: "rejection_previous_period",
    category: "rejection",
    reason:
      `Investigate: current rejection rate ${(currentRate * 100).toFixed(1)}%; ` +
      `baseline (equivalent previous period) ${(previousRate * 100).toFixed(1)}%; ` +
      `${ratio.toFixed(1)}x the previous-period baseline.`,
    current_value: currentRate,
    baseline_value: previousRate,
    difference_abs: differenceAbs,
    difference_pct: differencePct,
    current_period: currentPeriod,
    baseline_period: currentPeriod, // the "equivalent previous period" - see backendClient.getRequestsSummary's own documented limitation: only the ratio/rate is returned, not the previous period's own date bounds
    sample_size: sampleSize,
    source: "backend pending_request - rejection rate vs. its own equivalent previous period",
  };
}

// -- Customer ordering-gap signal ----------------------------------------
// Reuses ../lib/customerActivity.ts's detectSignals() (Phase 8) verbatim -
// this backend route can import it directly, no duplication needed, since
// both live in the same npm package/module graph. Scoped to a bounded top-
// N customers by order_count (NOT looped over the fleet's ~43,000
// customers - Phase 8 already ruled that out as a separate, much larger
// performance problem, and that reasoning still holds here).
const ATTENTION_TOP_CUSTOMER_LIMIT = 10;

export function customerGapInsight(
  custNb: string,
  customerName: string,
  signal: LongGapSignal,
  history: { committed_at: string }[],
  nowIso: string,
): AttentionInsight {
  const differenceAbs = signal.daysSinceLastOrder - signal.baselineIntervalDays;
  const differencePct = signal.baselineIntervalDays > 0 ? (differenceAbs / signal.baselineIntervalDays) * 100 : 0;
  // Mirrors ../lib/customerActivity.ts's own baselineIntervalDays(): with
  // 3+ orders the baseline is the mean of every interval *except* the one
  // right before the last order, so its period ends at the second-to-last
  // order; with exactly 2 orders there is only one interval, and that
  // single interval *is* the baseline, so its period ends at the last
  // order - the same date the "current gap" period below starts from.
  const baselineEndAt = history.length > 2
    ? history[history.length - 2].committed_at
    : history[history.length - 1].committed_at;
  const currentGapStartAt = history[history.length - 1].committed_at;
  return {
    id: `customer_ordering_gap_${custNb}`,
    category: "customer_ordering_gap",
    reason:
      `Investigate: customer ${customerName} (${custNb}) has gone ${signal.daysSinceLastOrder} days without an order; ` +
      `baseline (their own average ordering interval) ${signal.baselineIntervalDays} days; ` +
      `${differencePct >= 0 ? "+" : ""}${differencePct.toFixed(1)}%; based on ${history.length} prior orders.`,
    current_value: signal.daysSinceLastOrder,
    baseline_value: signal.baselineIntervalDays,
    difference_abs: differenceAbs,
    difference_pct: differencePct,
    current_period: { from: currentGapStartAt, to: nowIso },
    baseline_period: { from: history[0].committed_at, to: baselineEndAt },
    sample_size: history.length,
    source: "catalog-service customer order history (top customers by order_count) + ../lib/customerActivity.ts (Phase 8 engine)",
    subject: { cust_nb: custNb, customer_name: customerName },
  };
}

export default async function overviewRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/overview", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const authorization = request.headers.authorization!;
    const period = periodOf(f);
    const filtersRecord = { ...f };

    try {
      const [orders, requests, customers, roster, salesmenOrders, ordersTrend] = await Promise.all([
        catalogClient.getOrdersSummary(toOrdersParams(f)),
        backendClient.getRequestsSummary(authorization, toRequestsParams(f)),
        catalogClient.getCustomersSummary(),
        backendClient.listSalesmen(authorization),
        catalogClient.getSalesmenOrderMetrics(toOrdersParams(f)),
        catalogClient.getOrdersTrend(toOrdersParams(f)),
      ]);

      const ordersCompleteness: CompletenessStatus =
        orders.orders_excluded_missing_commit_date > 0 ? "PARTIAL" : "COMPLETE";

      const kpis = {
        total_orders: metric({
          name: "Total Orders", value: orders.order_count, unit: "orders", period,
          filters: filtersRecord, source: "catalog-service order_header",
          formula: "COUNT(DISTINCT (order_nb, order_type))",
          completeness: ordersCompleteness,
          completeness_note: orders.orders_excluded_missing_commit_date > 0
            ? `${orders.orders_excluded_missing_commit_date} order(s) excluded - no completion date on file (older records from before our order-tracking upgrade)`
            : undefined,
        }),
        total_item_quantity: metric({
          name: "Total Item Quantity", value: orders.item_quantity, unit: "units", period,
          filters: filtersRecord, source: "catalog-service order_details",
          formula: "SUM(order_details.qty)", completeness: ordersCompleteness,
        }),
        total_order_lines: metric({
          name: "Total Order Lines", value: orders.order_line_count, unit: "lines", period,
          filters: filtersRecord, source: "catalog-service order_details",
          formula: "COUNT(order_details.*)", completeness: ordersCompleteness,
        }),
        average_items_per_order: metric({
          name: "Average Items per Order", value: orders.avg_items_per_order, unit: "units/order",
          period, filters: filtersRecord, source: "catalog-service order_details",
          formula: "item_quantity / order_count", completeness: ordersCompleteness,
        }),
        total_requests: metric({
          name: "Total Requests",
          value: requests.status_counts.reduce((sum, s) => sum + s.count, 0),
          unit: "requests", period, filters: filtersRecord, source: "backend pending_request",
          formula: "COUNT(pending_request.*)", completeness: "COMPLETE" as CompletenessStatus,
        }),
        current_backlog: metric({
          name: "Current Backlog", value: requests.backlog.total, unit: "requests", period: null,
          filters: filtersRecord, source: "backend pending_request",
          formula: "COUNT WHERE status IN (new, in_review, callback)",
          completeness: "COMPLETE" as CompletenessStatus,
        }),
        rejection_rate: metric({
          name: "Rejection Rate", value: requests.rejection.rejection_rate, unit: "ratio", period,
          filters: filtersRecord, source: "backend pending_request",
          formula: "rejected / (rejected + committed)",
          completeness: requests.rejection.sample_size > 0 ? "COMPLETE" as CompletenessStatus : "UNAVAILABLE" as CompletenessStatus,
        }),
        median_turnaround: metric({
          name: "Median Turnaround", value: requests.turnaround.median_seconds, unit: "seconds",
          period, filters: filtersRecord, source: "backend pending_request",
          formula: "median(decided_at - created_at) over rejected/committed requests",
          completeness: requests.turnaround.sample_size > 0 ? "PARTIAL" as CompletenessStatus : "UNAVAILABLE" as CompletenessStatus,
          completeness_note: "Only includes requests processed after our request-tracking upgrade; coverage improves over time",
        }),
      };

      // ---- Attention Center data (Phase 12) - additional bounded fetches,
      // used only to assemble `attention` below. Daily-granularity trend
      // for the fleet order-volume/quantity baselines; a bounded top-N
      // customer list + their order histories for the customer ordering-
      // gap signal (never the full ~43,000-customer fleet - see Phase 8's
      // documented reasoning on ../lib/customerActivity.ts). ----
      const [dailyOrdersTrend, topCustomersForGap] = await Promise.all([
        catalogClient.getOrdersTrend({ ...toOrdersParams(f), granularity: "day" }),
        catalogClient.getTopCustomers("order_count", ATTENTION_TOP_CUSTOMER_LIMIT, {
          date_from: f.date_from, date_to: f.date_to, salesman_id: f.salesman,
        }),
      ]);
      const customerHistoriesForGap = await Promise.all(
        topCustomersForGap.map((c) => catalogClient.getCustomerOrderHistory(c.cust_nb)),
      );

      const orderVolumeSeries: DailyPoint[] = dailyOrdersTrend.points.map((p) => ({
        bucket: p.bucket, value: p.order_count,
      }));
      const itemQuantitySeries: DailyPoint[] = dailyOrdersTrend.points.map((p) => ({
        bucket: p.bucket, value: Number(p.item_quantity),
      }));
      const requestVolumeSeries = aggregateDailyVolume(
        requests.volume_over_time.map((v) => ({ day: v.day, count: v.count })),
      );

      const attentionInsights: AttentionInsight[] = [
        ...fleetBaselineInsights(
          orderVolumeSeries, "order_volume", "fleet daily order count",
          "catalog-service order_header, daily granularity",
        ),
        ...fleetBaselineInsights(
          itemQuantitySeries, "quantity", "fleet daily item quantity",
          "catalog-service order_details, daily granularity",
        ),
        ...fleetBaselineInsights(
          requestVolumeSeries, "request", "daily request volume",
          "backend pending_request, daily granularity (summed across all statuses)",
        ),
      ];

      const rejection = rejectionInsight(
        requests.rejection.rejection_rate,
        requests.rejection.previous_period_rejection_rate,
        period ?? { from: null, to: null },
        requests.rejection.sample_size,
      );
      if (rejection) attentionInsights.push(rejection);

      const nowIso = new Date().toISOString();
      for (let i = 0; i < topCustomersForGap.length; i++) {
        const c = topCustomersForGap[i];
        const history = customerHistoriesForGap[i];
        if (history.length < 2) continue; // detectSignals needs >=2 orders for a long_gap signal
        const historyPoints: OrderHistoryPoint[] = history.map((h) => ({
          committedAt: h.committed_at, itemQuantity: Number(h.item_quantity),
        }));
        const gap = detectSignals(historyPoints).find((s): s is LongGapSignal => s.type === "long_gap");
        if (!gap) continue;
        attentionInsights.push(customerGapInsight(c.cust_nb, c.customer_name, gap, history, nowIso));
      }

      const attentionNote = attentionInsights.length > 0
        ? `${attentionInsights.length} signal(s) found across order volume, item quantity, request volume, `
          + `rejections, and customer ordering gaps (based on the top ${ATTENTION_TOP_CUSTOMER_LIMIT} customers by `
          + `order volume - see an individual customer's page for their own signals). Turnaround and per-item `
          + `quantity trend aren't included here yet; item-level trends are available on each item's own page.`
        : `No unusual signals in the current data across order volume, item quantity, request volume, rejections, `
          + `and customer ordering gaps (based on the top ${ATTENTION_TOP_CUSTOMER_LIMIT} customers by order `
          + `volume) - a quiet period, not a sign the system isn't working. Turnaround and per-item quantity trend `
          + `aren't included here yet; item-level trends are available on each item's own page.`;

      const salesmenByLoginId = new Map(roster.map((s) => [s.login_id, s]));
      const salesBySalesman = salesmenOrders.by_salesman
        .filter((row) => row.salesman_id !== null)
        .map((row) => ({
          salesman_id: row.salesman_id,
          salesman_name: salesmenByLoginId.get(row.salesman_id!)?.name ?? null,
          order_count: row.order_count,
          item_quantity: row.item_quantity,
        }))
        .sort((a, b) => b.order_count - a.order_count);

      return reply.send({
        kpis,
        sales_by_salesman: envelope(salesBySalesman, {
          source: "catalog-service order_header/order_details + customer_ownership_history, backend salesmen",
          filters: filtersRecord, period,
          completeness: salesmenOrders.orders_excluded_missing_commit_date > 0 ? "PARTIAL" : "COMPLETE",
          completeness_note: salesmenOrders.orders_excluded_missing_commit_date > 0
            ? `${salesmenOrders.orders_excluded_missing_commit_date} order(s) excluded - couldn't determine which salesman owned the customer at the time`
            : undefined,
        }),
        request_volume_over_time: envelope(requests.volume_over_time, {
          source: "backend pending_request", filters: filtersRecord, period,
          completeness: "COMPLETE",
        }),
        order_trend: envelope(ordersTrend.points, {
          source: "catalog-service order_header/order_details", filters: filtersRecord, period,
          formula: "COUNT(DISTINCT (order_nb, order_type)) / COUNT(order_details.*) / SUM(order_details.qty), grouped by commit month",
          completeness: ordersTrend.orders_excluded_missing_commit_date > 0 ? "PARTIAL" : "COMPLETE",
          completeness_note: ordersTrend.orders_excluded_missing_commit_date > 0
            ? `${ordersTrend.orders_excluded_missing_commit_date} order(s) excluded - no completion date on file (older records from before our order-tracking upgrade)`
            : undefined,
        }),
        customers: envelope(
          { assigned: customers.assigned, unassigned: customers.unassigned, total: customers.total },
          {
            source: "catalog-service customer", filters: {}, period: null,
            completeness: "PARTIAL",
            completeness_note: "Shows assigned vs. unassigned customers only; an active/inactive breakdown isn't available yet",
          },
        ),
        // Attention Center: real evidence-backed signals, never padded
        // with a weak one just to have content. "PARTIAL" reflects that
        // most required categories are computed for real here (order
        // volume, quantity, request, rejection, customer ordering-gap)
        // while turnaround and per-item quantity trend are deliberately
        // out of scope - see attentionNote for a plain-language summary.
        attention: {
          insights: attentionInsights,
          status: "PARTIAL" as CompletenessStatus,
          note: attentionNote,
        },
      });
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
