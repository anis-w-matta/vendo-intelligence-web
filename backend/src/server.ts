import Fastify from "fastify";
import { config } from "./config.js";
import overviewRoutes from "./routes/overview.js";
import salesmenRoutes from "./routes/salesmen.js";
import salesmanDetailRoutes from "./routes/salesmanDetail.js";
import ordersRoutes from "./routes/orders.js";
import requestsRoutes from "./routes/requests.js";
import operationsRoutes from "./routes/operations.js";
import customersRoutes from "./routes/customers.js";
import customerDetailRoutes from "./routes/customerDetail.js";
import itemsRoutes from "./routes/items.js";
import categoriesRoutes from "./routes/categories.js";
import aiQualityRoutes from "./routes/aiQuality.js";
import insightsRoutes from "./routes/insights.js";
import dataHealthRoutes from "./routes/dataHealth.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

  const routeModules = [
    overviewRoutes, salesmenRoutes, salesmanDetailRoutes, ordersRoutes,
    requestsRoutes, operationsRoutes, customersRoutes, customerDetailRoutes,
    itemsRoutes, categoriesRoutes, aiQualityRoutes, insightsRoutes, dataHealthRoutes,
  ];
  for (const register of routeModules) {
    app.register(register);
  }

  return app;
}

async function main() {
  const app = buildApp();
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only auto-start when run directly (node dist/server.js / tsx src/server.ts)
// - tests import buildApp() and drive it via app.inject() instead.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
