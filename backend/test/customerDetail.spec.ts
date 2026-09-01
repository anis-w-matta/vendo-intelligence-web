import { describe, expect, it, vi } from "vitest";
import { mockAllClients, customerOrderHistory } from "./mocks.js";

// vi.doMock (not hoisted vi.mock) so mocks are wired up before anything
// that transitively imports catalogClient/backendClient is evaluated -
// dynamic imports only, no static import of customerDetail.ts/server.ts
// above this line, or Node's module cache would pin the real (unmocked)
// modules before doMock can intercept them. Mirrors routes.spec.ts.
mockAllClients();
const { buildApp } = await import("../src/server.js");
const { toOrderHistoryPoints } = await import("../src/routes/customerDetail.js");

describe("toOrderHistoryPoints", () => {
  it("parses catalog-service's string item_quantity into a number and carries committed_at through unchanged", () => {
    const points = toOrderHistoryPoints([
      { order_nb: "O1", order_type: "standard", committed_at: "2026-01-01T00:00:00Z", item_quantity: "12", order_line_count: 3 },
      { order_nb: "O2", order_type: "standard", committed_at: "2026-02-01T00:00:00Z", item_quantity: "7.5", order_line_count: 1 },
    ]);
    expect(points).toEqual([
      { committedAt: "2026-01-01T00:00:00Z", itemQuantity: 12 },
      { committedAt: "2026-02-01T00:00:00Z", itemQuantity: 7.5 },
    ]);
  });

  it("returns an empty array for a customer with no committed order history", () => {
    expect(toOrderHistoryPoints([])).toEqual([]);
  });
});

describe("GET /api/admin/intelligence/customers/:id (Phase 8 additions)", () => {
  it("includes activity_state, interval_stats, signals, top_items, and order_trend derived from real order history", async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/intelligence/customers/C1",
      headers: { authorization: "Bearer test-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // customerOrderHistory (mocks.ts) is three same-quantity orders spaced
    // 30 days apart, most recent 2026-08-01 - a textbook "Stable" customer
    // with no signals, computed by the shared customerActivity.ts, not
    // re-derived here.
    expect(body.data.activity_state).toBe("Stable");
    expect(body.data.interval_stats.orderCount).toBe(customerOrderHistory.length);
    expect(body.data.interval_stats.avgIntervalDays).toBeGreaterThan(0);
    expect(Array.isArray(body.data.signals)).toBe(true);
    expect(body.data.top_items).toEqual(expect.any(Array));
    expect(body.data.order_trend.points).toEqual(expect.any(Array));

    // Never a fabricated verdict - only the exact six documented states.
    expect(["New", "Active", "Stable", "Declining", "Dormant", "Insufficient Data"]).toContain(
      body.data.activity_state,
    );
  });

  it("returns Insufficient Data (never a fabricated state) when the customer has no committed order history", async () => {
    const { adminAuthMe, requestsSummary, customerDetailSummary, ownershipHistory, topItems, ordersTrend } =
      await import("./mocks.js");
    vi.resetModules();
    vi.doMock("../src/lib/backendClient.js", () => ({
      getAuthMe: vi.fn().mockResolvedValue(adminAuthMe),
      getRequestsSummary: vi.fn().mockResolvedValue(requestsSummary),
    }));
    vi.doMock("../src/lib/catalogClient.js", () => ({
      getCustomerSummary: vi.fn().mockResolvedValue(customerDetailSummary),
      getCustomerOwnershipHistory: vi.fn().mockResolvedValue(ownershipHistory),
      getTopItems: vi.fn().mockResolvedValue(topItems),
      getOrdersTrend: vi.fn().mockResolvedValue(ordersTrend),
      // The one override under test: no committed order history at all.
      getCustomerOrderHistory: vi.fn().mockResolvedValue([]),
    }));
    const { buildApp: buildAppNoHistory } = await import("../src/server.js");
    const app2 = buildAppNoHistory();
    await app2.ready();
    const res = await app2.inject({
      method: "GET",
      url: "/api/admin/intelligence/customers/C1",
      headers: { authorization: "Bearer test-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.activity_state).toBe("Insufficient Data");
  });
});
