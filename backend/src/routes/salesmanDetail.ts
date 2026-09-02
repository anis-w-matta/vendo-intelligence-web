// Phase 6/7 "Salesman 360" - trends/portfolio/requests/rejection/
// turnaround/AI corrections for one salesman, plus (Phase 7) items/customer,
// items/order, orders/customer, order/quantity/request trends, and fleet
// benchmarking (mean/median across active salesmen) for that one salesman's
// KPIs. Benchmarking numbers are investigation signals only - never a
// performance verdict - see docs/audit and the Phase 7 spec.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toOrdersParams, toRequestsParams } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export default async function salesmanDetailRoutes(app: FastifyInstance) {
  app.get(
    "/api/admin/intelligence/salesmen/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = FiltersQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
      }
      const f = { ...parsed.data, salesman: id };
      const authorization = request.headers.authorization!;
      const period = periodOf(f);

      try {
        const [roster, orderMetrics, requestMetrics, topCustomers, ordersTrend, requestsSummary, customersPerSalesman] = await Promise.all([
          backendClient.listSalesmen(authorization, true),
          // Note: getSalesmenOrderMetrics/getSalesmenRequestMetrics are
          // fleet-wide breakdowns (their param types deliberately Omit
          // salesman_id - neither upstream endpoint filters by it), so
          // by_salesman/requestMetrics below still cover every salesman -
          // reused for fleet_average, not just this one row.
          catalogClient.getSalesmenOrderMetrics(toOrdersParams(f)),
          backendClient.getSalesmenRequestMetrics(authorization, toRequestsParams(f)),
          catalogClient.getTopCustomers("order_count", 10, {
            date_from: f.date_from, date_to: f.date_to, salesman_id: id,
          }),
          // Order/quantity trend, scoped to this one salesman via
          // salesman_id - this endpoint DOES honor it (point-in-time
          // ownership attribution, verified server-side).
          catalogClient.getOrdersTrend(toOrdersParams(f)),
          // Request volume/turnaround/rejection, scoped to this one
          // salesman via salesman_id - RequestsFilter.salesman_id is
          // honored by every field on this endpoint (verified server-side).
          backendClient.getRequestsSummary(authorization, toRequestsParams(f)),
          // Current portfolio size (live headcount) - see
          // catalogClient.getCustomersPerSalesman's doc comment for why
          // this is separate from orderMetrics' customer_count.
          catalogClient.getCustomersPerSalesman(),
        ]);

        const salesman = roster.find((s) => s.login_id === id);
        if (!salesman) {
          return reply.code(404).send({ error: `no such salesman ${id}` });
        }

        const orderByLoginId = new Map(orderMetrics.by_salesman.map((r) => [r.salesman_id, r]));
        const requestByLoginId = new Map(requestMetrics.map((r) => [r.salesman_id, r]));
        const currentCustomersByLoginId = new Map(
          customersPerSalesman.map((r) => [r.salesman_id, r.current_customer_count]));

        const orders = orderByLoginId.get(id);
        const requests = requestByLoginId.get(id);
        const orderCount = orders?.order_count ?? 0;
        const customerCount = orders?.customer_count ?? 0;
        const currentCustomerCount = currentCustomersByLoginId.get(id) ?? 0;
        const itemQuantityNum = Number(orders?.item_quantity ?? "0");

        // Fleet benchmarking (#4): mean order_count/item_quantity/
        // customer_count/rejection_rate across active salesmen, median of
        // per-salesman median_turnaround_seconds (more robust to
        // outliers) - same "role===salesman" filter salesmen.ts applies,
        // plus is_active since this route's roster call (unlike
        // salesmen.ts's) includes inactive salesmen to be able to find
        // this one even if now inactive.
        const activeSalesmen = roster.filter((s) => s.role === "salesman" && s.is_active);
        const fleetOrderCounts: number[] = [];
        const fleetItemQuantities: number[] = [];
        const fleetCustomerCounts: number[] = [];
        const fleetRejectionRates: number[] = [];
        const fleetTurnaroundSeconds: number[] = [];
        for (const s of activeSalesmen) {
          const o = orderByLoginId.get(s.login_id);
          const r = requestByLoginId.get(s.login_id);
          if (o) {
            fleetOrderCounts.push(o.order_count);
            fleetItemQuantities.push(Number(o.item_quantity));
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
          item_quantity: mean(fleetItemQuantities),
          customer_count: mean(fleetCustomerCounts),
          rejection_rate: mean(fleetRejectionRates),
          median_turnaround_seconds: median(fleetTurnaroundSeconds),
        };

        // Request volume trend (#3, Activity section): sum raw per-status
        // daily counts down to one count per day - plain arithmetic
        // aggregation of counts already returned by the backend, not a
        // derived business ratio, so it's safe to do once here rather
        // than asking the frontend to re-group it per render.
        const volumeByDay = new Map<string, number>();
        for (const v of requestsSummary.volume_over_time) {
          volumeByDay.set(v.day, (volumeByDay.get(v.day) ?? 0) + v.count);
        }
        const requestVolumeTrend = [...volumeByDay.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([bucket, count]) => ({ bucket, count }));

        return reply.send(
          envelope(
            {
              salesman_id: salesman.login_id,
              salesman_name: salesman.name,
              is_active: salesman.is_active,
              order_count: orderCount,
              order_line_count: orders?.order_line_count ?? 0,
              item_quantity: orders?.item_quantity ?? "0",
              customer_count: customerCount,
              current_customer_count: currentCustomerCount,
              // Phase 7 gaps #1/#2: same divide-by-zero-guarded arithmetic
              // as salesmen.ts's fleet-table row.
              orders_per_customer: customerCount ? orderCount / customerCount : null,
              items_per_customer: customerCount ? itemQuantityNum / customerCount : null,
              items_per_order: orderCount ? itemQuantityNum / orderCount : null,
              request_count: requests?.request_count ?? 0,
              rejection_rate: requests?.rejection_rate ?? null,
              median_turnaround_seconds: requests?.median_turnaround_seconds ?? null,
              ai_correction_rate: requests?.ai_correction_rate ?? null,
              top_customers: topCustomers,
              fleet_average: fleetAverage,
              orders_trend: ordersTrend.points,
              requests_summary: requestsSummary,
              request_volume_trend: requestVolumeTrend,
            },
            {
              source: "catalog-service order_header/customer_ownership_history + backend pending_request/salesman",
              filters: { ...f }, period, completeness: "PARTIAL",
              completeness_note: `${orderMetrics.orders_excluded_missing_commit_date} order(s) excluded fleet-wide - couldn't determine which salesman owned the customer at the time. The fleet average is based on ${fleetAverage.sample_size} active salesman(s) and is meant as a comparison point, not a performance verdict.`,
            },
          ),
        );
      } catch (err) {
        return handleUpstreamError(err, reply);
      }
    },
  );
}
