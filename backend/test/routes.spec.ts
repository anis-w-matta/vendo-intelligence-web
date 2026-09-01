import { beforeAll, describe, expect, it, vi } from "vitest";
import { mockAllClients, ordersTrendDaily } from "./mocks.js";

// vi.doMock (not the hoisted vi.mock) so we can set up the mocks before
// dynamically importing anything that transitively pulls in
// backendClient/catalogClient - buildApp() must only be imported after
// this runs.
mockAllClients();
const { buildApp } = await import("../src/server.js");

const AUTH = { authorization: "Bearer test-token" };

const ROUTES: { method: "GET"; url: string }[] = [
  { method: "GET", url: "/api/admin/intelligence/overview" },
  { method: "GET", url: "/api/admin/intelligence/salesmen" },
  { method: "GET", url: "/api/admin/intelligence/salesmen/sm_a" },
  { method: "GET", url: "/api/admin/intelligence/orders" },
  { method: "GET", url: "/api/admin/intelligence/requests" },
  { method: "GET", url: "/api/admin/intelligence/operations" },
  { method: "GET", url: "/api/admin/intelligence/customers" },
  { method: "GET", url: "/api/admin/intelligence/customers/C1" },
  { method: "GET", url: "/api/admin/intelligence/items" },
  { method: "GET", url: "/api/admin/intelligence/items/I1" },
  { method: "GET", url: "/api/admin/intelligence/categories" },
  { method: "GET", url: "/api/admin/intelligence/ai-quality" },
  { method: "GET", url: "/api/admin/intelligence/insights" },
  { method: "GET", url: "/api/admin/intelligence/data-health" },
];

describe("all 13+ intelligence routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  it.each(ROUTES)("$method $url returns 200 for a verified admin", async ({ method, url }) => {
    const res = await app.inject({ method, url, headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it.each(ROUTES)("$method $url returns 401 with no bearer token", async ({ method, url }) => {
    const res = await app.inject({ method, url });
    expect(res.statusCode).toBe(401);
  });

  it.each(ROUTES)(
    "$method $url never mentions a forbidden financial field",
    async ({ method, url }) => {
      const res = await app.inject({ method, url, headers: AUTH });
      const body = res.body.toLowerCase();
      for (const forbidden of ["revenue", "\"price\"", "price_", "_price", "\"amount\"", "order_value"]) {
        expect(body, `${url} response contained forbidden field marker: ${forbidden}`).not.toContain(forbidden);
      }
    },
  );

  it("overview response shapes KPIs with the metric contract", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/overview", headers: AUTH });
    const body = res.json();
    expect(body.kpis.total_orders).toMatchObject({
      name: "Total Orders",
      value: 10,
      unit: "orders",
      source: expect.any(String),
      formula: expect.any(String),
      completeness: expect.any(String),
    });
    expect(body.kpis.total_orders.last_updated).toBeTruthy();
  });

  it("overview includes an order/item-quantity trend envelope from catalog-service", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/overview", headers: AUTH });
    const body = res.json();
    expect(body.order_trend.data).toEqual([
      { bucket: "2026-07", order_count: 4, order_line_count: 10, item_quantity: "60" },
      { bucket: "2026-08", order_count: 6, order_line_count: 15, item_quantity: "90" },
    ]);
    expect(body.order_trend.meta.completeness).toBe("PARTIAL");
    expect(body.order_trend.meta.completeness_note).toMatch(/excluded/);
  });

  it("overview's Attention Center runs the real Phase 12 engine and stays honest when the canned mock data is quiet", async () => {
    // The shared mock data (mocks.ts) has no real day-granularity spike, no
    // previous-period rejection rate, and a customer history too short/too
    // recent for a long-gap signal - so the real engine legitimately finds
    // nothing to flag. That's "PARTIAL" (5 of 7 required categories
    // computed for real; turnaround and per-item quantity trend are
    // documented, deliberate exclusions) with an empty list, never a
    // fabricated signal to have content.
    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/overview", headers: AUTH });
    const body = res.json();
    expect(body.attention.insights).toEqual([]);
    expect(body.attention.status).toBe("PARTIAL");
    expect(body.attention.note).toMatch(/rejection/i);
    expect(body.attention.note).toMatch(/turnaround/i);
    expect(body.attention.note).toMatch(/quiet system/i);
  });

  it("overview's Attention Center surfaces a real order-volume signal with full evidence when the daily trend actually spikes", async () => {
    vi.resetModules();
    mockAllClients({ dailyOrdersTrend: ordersTrendDaily });
    const { buildApp: buildAppSpiking } = await import("../src/server.js");
    const appSpiking = buildAppSpiking();
    await appSpiking.ready();

    const res = await appSpiking.inject({ method: "GET", url: "/api/admin/intelligence/overview", headers: AUTH });
    const body = res.json();
    const orderVolumeInsight = body.attention.insights.find(
      (i: { category: string; source: string }) => i.category === "order_volume",
    );
    expect(orderVolumeInsight).toBeTruthy();
    expect(orderVolumeInsight.reason).toMatch(/^Investigate: current fleet daily order count/);
    expect(orderVolumeInsight.current_value).toBeGreaterThan(orderVolumeInsight.baseline_value);
    expect(orderVolumeInsight.difference_pct).toBeGreaterThan(30);
    expect(orderVolumeInsight.sample_size).toBeGreaterThanOrEqual(5);
    expect(orderVolumeInsight.current_period.from).toBeTruthy();
    expect(orderVolumeInsight.baseline_period.from).toBeTruthy();
    expect(body.attention.status).toBe("PARTIAL");
  });

  it("insights is an honest stub, not fabricated data", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/insights", headers: AUTH });
    const body = res.json();
    expect(body.insights).toEqual([]);
    expect(body.status).toBe("UNAVAILABLE");
  });

  it("salesmen response marks incomplete attribution rather than hiding it", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/salesmen", headers: AUTH });
    const body = res.json();
    expect(body.meta.completeness).toBe("PARTIAL");
    expect(body.meta.completeness_note).toMatch(/excluded/);
  });
});

describe("auth failure modes", () => {
  it("403s a verified but non-admin caller", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/backendClient.js", async () => {
      const actual = await vi.importActual<typeof import("../src/lib/backendClient.js")>(
        "../src/lib/backendClient.js",
      );
      return {
        ...actual,
        getAuthMe: vi.fn().mockResolvedValue({
          login_id: "sm_a", name: "Ahmed", email: null, role: "salesman", is_active: true,
        }),
      };
    });
    vi.doMock("../src/lib/catalogClient.js", () => ({}));
    const { buildApp: buildAppNonAdmin } = await import("../src/server.js");
    const app2 = buildAppNonAdmin();
    await app2.ready();
    const res = await app2.inject({
      method: "GET", url: "/api/admin/intelligence/overview", headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
  });
});
