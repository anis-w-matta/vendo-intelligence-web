import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";

export default async function categoriesRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/categories", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const period = periodOf(f);

    try {
      const categories = await catalogClient.getCategoriesSummary({
        date_from: f.date_from, date_to: f.date_to, salesman_id: f.salesman,
      });

      // Phase 9 category trend (gap #2): rather than a new per-category
      // detail page (not required by this phase's spec - only items get a
      // documented detail requirement), attach a monthly order/quantity
      // trend directly onto the top 1-2 categories by item_quantity, using
      // catalog-service's existing category-filtered orders-trend
      // endpoint. Every other row's `trend` stays undefined - never a
      // fabricated empty trend for a category nobody asked to see one for.
      const topByQuantity = [...categories]
        .sort((a, b) => Number(b.item_quantity) - Number(a.item_quantity))
        .slice(0, 2);
      const trendEntries = await Promise.all(
        topByQuantity.map(async (c): Promise<[string, catalogClient.OrdersTrendOut]> => [
          c.category,
          await catalogClient.getOrdersTrend({
            category: c.category, date_from: f.date_from, date_to: f.date_to, salesman_id: f.salesman,
          }),
        ]),
      );
      const trendByCategory = new Map(trendEntries);
      const categoriesWithTrend = categories.map((c) => ({
        ...c,
        trend: trendByCategory.get(c.category),
      }));

      // categories_summary itself needs no committed_at (matches every
      // other unfiltered summary in this codebase), but the attached
      // trends structurally do - so the envelope's own completeness must
      // reflect whichever trend(s) excluded orders, not just default to
      // COMPLETE (the exact bug already fixed once in catalog-service's
      // own orders_trend() - see its commit message - but that fix only
      // guarantees the per-trend count is honest, not that a caller
      // embedding it into a larger envelope actually reads it).
      const trendExclusions = trendEntries.reduce(
        (sum, [, trend]) => sum + trend.orders_excluded_missing_commit_date, 0);

      return reply.send(
        envelope(categoriesWithTrend, {
          source: "catalog-service order_details/item", filters: { ...f }, period,
          completeness: trendExclusions > 0 ? "PARTIAL" : "COMPLETE",
          completeness_note: trendExclusions > 0
            ? `${trendExclusions} order(s) excluded from this trend - no completion date on file`
            : undefined,
        }),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
