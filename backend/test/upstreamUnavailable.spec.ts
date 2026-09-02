// Phase 17 certification gap: routes.spec.ts's shared mockAllClients()
// (test/mocks.ts) always resolves successfully, so no existing test
// actually drives a route through lib/errors.ts's handleUpstreamError -
// the mechanism every route wraps its upstream calls in (see e.g.
// src/routes/salesmen.ts, orders.ts, overview.ts's try/catch around
// backendClient/catalogClient calls). This file proves, for a few
// representative routes touching each upstream service, that a network
// error or a non-200 from catalog-service/the Python backend produces a
// clean 503 "unavailable" response - never an unhandled exception/500 and
// never a fabricated 200.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mockAllClients } from "./mocks.js";
import { UpstreamError } from "../src/lib/httpClient.js";

mockAllClients();
const backendClient = await import("../src/lib/backendClient.js");
const catalogClient = await import("../src/lib/catalogClient.js");
const { buildApp } = await import("../src/server.js");

const AUTH = { authorization: "Bearer test-token" };

describe("upstream-service-unavailable handling", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  it("GET /salesmen returns a clean 503 when the Python backend is unreachable (network error)", async () => {
    vi.mocked(backendClient.listSalesmen).mockRejectedValueOnce(
      new UpstreamError("backend", "network", "network error calling backend at /salesmen: ECONNREFUSED"),
    );

    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/salesmen", headers: AUTH });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error).toMatch(/upstream service unavailable/);
    expect(body.error).toContain("backend");
  });

  it("GET /orders returns a clean 503 when catalog-service responds non-200", async () => {
    vi.mocked(catalogClient.getOrdersSummary).mockRejectedValueOnce(
      new UpstreamError("catalog-service", 500, "catalog-service /analytics/orders/summary responded 500"),
    );

    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/orders", headers: AUTH });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error).toMatch(/upstream service unavailable/);
    expect(body.error).toContain("catalog-service");
  });

  it("GET /overview returns a clean 503, not a 500 or fabricated 200, when a backend call fails mid-aggregation", async () => {
    vi.mocked(backendClient.getRequestsSummary).mockRejectedValueOnce(
      new UpstreamError("backend", "network", "network error calling backend at /analytics/requests/summary: ECONNREFUSED"),
    );

    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/overview", headers: AUTH });

    expect(res.statusCode).toBe(503);
    expect(res.statusCode).not.toBe(500);
    const body = res.json();
    expect(body.error).toMatch(/upstream service unavailable/);
  });

  it("a plain non-UpstreamError thrown by an upstream call is not swallowed as a fake 503", async () => {
    // handleUpstreamError deliberately re-throws anything that isn't an
    // UpstreamError (see lib/errors.ts) - Fastify's own error handler then
    // turns it into a 500, which is correct: a genuine bug must not be
    // hidden behind the same "unavailable" response an operator would read
    // as a transient, not-our-fault condition.
    vi.mocked(catalogClient.getCustomersSummary).mockRejectedValueOnce(new Error("boom: unexpected bug"));

    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/customers", headers: AUTH });

    expect(res.statusCode).toBe(500);
  });
});
