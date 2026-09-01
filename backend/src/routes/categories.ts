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
      return reply.send(
        envelope(categories, {
          source: "catalog-service order_details/item", filters: { ...f }, period, completeness: "COMPLETE",
        }),
      );
    } catch (err) {
      return handleUpstreamError(err, reply);
    }
  });
}
