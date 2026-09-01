import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
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

  // Same permissive dev convention as the existing backend's own
  // CORSMiddleware(allow_origins=["*"]) (app/main.py) - the React app is
  // a separate origin (Vite dev server / a static host) hitting this BFF
  // directly, never Postgres.
  app.register(cors, { origin: true });

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
// pathToFileURL (not a raw `file://` template) so this matches on Windows,
// where process.argv[1] is a backslash path, not a URL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
