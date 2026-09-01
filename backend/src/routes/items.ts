// Phase 6 ITEMS: two separate rankings (by quantity, by order frequency)
// - never blended into one metric, per the master prompt. No price
// fields anywhere.
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../plugins/auth.js";
import { FiltersQuery, periodOf } from "../lib/filters.js";
import { envelope } from "../lib/metricContract.js";
import * as catalogClient from "../lib/catalogClient.js";
import { handleUpstreamError } from "../lib/errors.js";

export default async function itemsRoutes(app: FastifyInstance) {
  app.get("/api/admin/intelligence/items", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = FiltersQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid filters", detail: parsed.error.flatten() });
    }
    const f = parsed.data;
    const period = periodOf(f);
    const limit = f.limit ?? 20;

    try {
      const [topByQuantity, topByFrequency] = await Promise.all([
        catalogClient.getTopItems("quantity", limit, {
          date_from: f.date_from, date_to: f.date_to, category: f.category, salesman_id: f.salesman,
        }),
        catalogClient.getTopItems("order_frequency", limit, {
          date_from: f.date_from, date_to: f.date_to, category: f.category, salesman_id: f.salesman,
        }),
      ]);

      return reply.send(
        envelope(
          { top_items_by_quantity: topByQuantity, top_items_by_order_frequency: topByFrequency },
          { source: "catalog-service order_details/item", filters: { ...f }, period, completeness: "COMPLETE" },
        ),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });

  app.get(
    "/api/admin/intelligence/items/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const summary = await catalogClient.getItemSummary(id);
        return reply.send(
          envelope(summary, {
            source: "catalog-service order_details/item", filters: { item: id }, period: null,
            completeness: "COMPLETE",
          }),
        );
      } catch (err) {
        return handleUpstreamError(err, reply);
      }
    },
  );
}
