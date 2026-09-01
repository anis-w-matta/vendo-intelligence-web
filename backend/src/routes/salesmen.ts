// Phase 6 SALES: per-salesman order/line/quantity/customer counts, plus
// request/AI-quality metrics - combined here (not in either Python
// service) since it needs both services' data joined by salesman_id, and
// display names from backend's own roster.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf, toOrdersParams, toRequestsParams } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as backendClient from "../lib/backendClient.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";

export default async function salesmenRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/salesmen", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const authorization = request.headers.authorization!;
    const period = periodOf(f);

    try {
      const [roster, orderMetrics, requestMetrics] = await Promise.all([
        backendClient.listSalesmen(authorization),
        catalogClient.getSalesmenOrderMetrics(toOrdersParams(f)),
        backendClient.getSalesmenRequestMetrics(authorization, toRequestsParams(f)),
      ]);

      const orderByLoginId = new Map(orderMetrics.by_salesman.map((r) => [r.salesman_id, r]));
      const requestByLoginId = new Map(requestMetrics.map((r) => [r.salesman_id, r]));

      const rows = roster
        .filter((s) => s.role === "salesman")
        .map((s) => {
          const o = orderByLoginId.get(s.login_id);
          const r = requestByLoginId.get(s.login_id);
          const orderCount = o?.order_count ?? 0;
          const customerCount = o?.customer_count ?? 0;
          const itemQuantityNum = Number(o?.item_quantity ?? "0");
          return {
            salesman_id: s.login_id,
            salesman_name: s.name,
            is_active: s.is_active,
            order_count: orderCount,
            order_line_count: o?.order_line_count ?? 0,
            item_quantity: o?.item_quantity ?? "0",
            customer_count: customerCount,
            orders_per_customer: customerCount ? orderCount / customerCount : null,
            // Phase 7: items/customer, items/order - pure arithmetic on data
            // already fetched above, same divide-by-zero-guard pattern as
            // orders_per_customer.
            items_per_customer: customerCount ? itemQuantityNum / customerCount : null,
            items_per_order: orderCount ? itemQuantityNum / orderCount : null,
            rejection_rate: r?.rejection_rate ?? null,
            median_turnaround_seconds: r?.median_turnaround_seconds ?? null,
            ai_correction_rate: r?.ai_correction_rate ?? null,
            request_count: r?.request_count ?? 0,
          };
        });

      return reply.send(
        envelope(rows, {
          source: "catalog-service order_header/order_details/customer_ownership_history + backend pending_request/salesman",
          filters: { ...f }, period, completeness: "PARTIAL",
          completeness_note: `${orderMetrics.orders_excluded_missing_commit_date} order(s) excluded from order metrics - no resolvable point-in-time salesman attribution. Do not rank salesmen by order_count alone - see 06_phase_6_sales_customers_items.md.`,
        }),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
