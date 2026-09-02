// Phase 15 (Ask VeNdO Intelligence) - route-level tests for
// POST /api/admin/intelligence/ask. Drives the real Fastify app via
// app.inject() exactly like geminiExplain.spec.ts, with backendClient/
// catalogClient mocked (mockAllClients) and global fetch stubbed so the
// ONLY network calls this file ever makes are the mocked ones to
// Gemini's REST endpoint - never a real call anywhere in this suite.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockAllClients } from "./mocks.js";

mockAllClients();
vi.doMock("../src/config.js", () => ({
  config: {
    backendUrl: "http://127.0.0.1:8000",
    catalogUrl: "http://127.0.0.1:8100",
    backendApiKey: undefined,
    catalogApiKey: undefined,
    geminiApiKey: "test-key",
    port: 8200,
  },
}));

function geminiOkResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  } as Response;
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { buildApp } = await import("../src/server.js");
const { __resetCacheForTests, SAFETY_INSTRUCTIONS } = await import("../src/lib/geminiClient.js");
const backendClient = await import("../src/lib/backendClient.js");

const AUTH = { authorization: "Bearer test-token" };
const GENERIC_ANSWER = "Here is a short, plain-language answer grounded only in the supplied facts.";

async function askWithClassification(app: Awaited<ReturnType<typeof buildApp>>, question: string, classificationJson: unknown) {
  fetchMock.mockReset();
  fetchMock
    .mockResolvedValueOnce(geminiOkResponse(JSON.stringify(classificationJson)))
    .mockResolvedValue(geminiOkResponse(GENERIC_ANSWER));
  return app.inject({ method: "POST", url: "/api/admin/intelligence/ask", headers: AUTH, payload: { question } });
}

describe("POST /api/admin/intelligence/ask", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  beforeEach(() => {
    __resetCacheForTests();
    fetchMock.mockReset();
    vi.mocked(backendClient.listSalesmen).mockClear();
  });

  it("returns 401 with no bearer token", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/intelligence/ask", payload: { question: "How is AI performing?" } });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 for a missing/too-short question", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/intelligence/ask", headers: AUTH, payload: { question: "hi" } });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when the body carries an extra, unrecognized field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/intelligence/ask",
      headers: AUTH,
      payload: { question: "How is AI performing?", price: 99 },
    });
    expect(res.statusCode).toBe(400);
  });

  // ---- The phase's 7 worked example questions -> intent mapping ----

  it('maps "Who created the most orders this month?" to salesman_ranking(order_count, desc, current_month)', async () => {
    const res = await askWithClassification(app, "Who created the most orders this month?", {
      type: "salesman_ranking", metric: "order_count", sort: "desc", limit: 5, timeframe: "current_month",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).toEqual({ type: "salesman_ranking", metric: "order_count", sort: "desc", limit: 5, timeframe: "current_month" });
    expect(body.status).toBe("ok");
    expect(body.result.timeframe).toBe("current_month");
    expect(body.result.period).not.toBeNull();
  });

  it('maps "Which salesman has the most item quantity?" to salesman_ranking(item_quantity, desc)', async () => {
    const res = await askWithClassification(app, "Which salesman has the most item quantity?", {
      type: "salesman_ranking", metric: "item_quantity", sort: "desc", limit: 5, timeframe: "all_time",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent.type).toBe("salesman_ranking");
    expect(body.intent.metric).toBe("item_quantity");
    expect(body.status).toBe("ok");
    // sm_a has item_quantity "90", sm_b has "60" (see mocks.ts) - ranked desc, sm_a first.
    expect(body.result.ranked[0].salesman_id).toBe("sm_a");
  });

  it('maps "Which customers show declining activity?" to insight_lookup(category=Customer)', async () => {
    const res = await askWithClassification(app, "Which customers show declining activity?", {
      type: "insight_lookup", category: "Customer",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).toEqual({ type: "insight_lookup", category: "Customer" });
    expect(body.status).toBe("ok");
    expect(body.result.category).toBe("Customer");
  });

  it('maps "Why is backlog higher?" to operations_summary (the only source that actually carries backlog data)', async () => {
    const res = await askWithClassification(app, "Why is backlog higher?", { type: "operations_summary" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).toEqual({ type: "operations_summary" });
    expect(body.status).toBe("ok");
    expect(body.result.backlog).toBeDefined();
  });

  it('maps "Which items increased the most?" to insight_lookup(category=Item)', async () => {
    const res = await askWithClassification(app, "Which items increased the most?", {
      type: "insight_lookup", category: "Item",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).toEqual({ type: "insight_lookup", category: "Item" });
    expect(body.status).toBe("ok");
  });

  it('maps "Which salesmen have high rejection rates?" to salesman_ranking(rejection_rate, desc)', async () => {
    const res = await askWithClassification(app, "Which salesmen have high rejection rates?", {
      type: "salesman_ranking", metric: "rejection_rate", sort: "desc", limit: 5, timeframe: "all_time",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent.metric).toBe("rejection_rate");
    // sm_a rejection_rate 0.25, sm_b 0.0 (see mocks.ts) - ranked desc, sm_a first.
    expect(body.result.ranked[0].salesman_id).toBe("sm_a");
  });

  it('maps "How is AI performing?" to ai_quality_summary', async () => {
    const res = await askWithClassification(app, "How is AI performing?", { type: "ai_quality_summary" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.intent).toEqual({ type: "ai_quality_summary" });
    expect(body.status).toBe("ok");
    expect(body.result.reviewed_lines).toBe(10); // aiQualitySummary mock
  });

  // ---- Safety: financial questions and malformed classifications never execute ----

  it("rejects a financial/revenue question as unsupported and never executes a data lookup", async () => {
    const res = await askWithClassification(app, "What was our total revenue last month?", {
      type: "unsupported",
      reason: "This platform does not track revenue, price, or monetary data.",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("unsupported");
    expect(body.intent.type).toBe("unsupported");
    expect(body.result).toBeNull();
    expect(typeof body.reason).toBe("string");
    // Only the classification call happened - no second (answer) Gemini
    // call, and no upstream data source was ever touched.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(backendClient.listSalesmen).not.toHaveBeenCalled();
  });

  it("treats a Gemini classification that tries to escape the enum (e.g. a fabricated 'revenue_ranking' type) as unsupported, never executing it", async () => {
    const res = await askWithClassification(app, "Rank salesmen by revenue generated", {
      type: "revenue_ranking",
      metric: "revenue",
      sort: "desc",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("unsupported");
    expect(body.result).toBeNull();
    expect(backendClient.listSalesmen).not.toHaveBeenCalled();
  });

  it("treats a malformed/unparseable Gemini classification response as unsupported, never throwing", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(geminiOkResponse("I'm not able to help with that one, sorry!"));
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/intelligence/ask",
      headers: AUTH,
      payload: { question: "asdkjaslkdj random gibberish question" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("unsupported");
    expect(body.result).toBeNull();
    expect(backendClient.listSalesmen).not.toHaveBeenCalled();
  });

  // ---- Insufficient data: honest, deterministic, never Gemini-invented ----

  it("gives an honest 'not enough data' answer for an empty insight category without ever asking Gemini to invent one", async () => {
    // Item category is genuinely empty under the default mocks: the item
    // quantity-trend signal needs >=3 trend points, and mockAllClients'
    // default getOrdersTrend always returns the same 2-point series.
    const res = await askWithClassification(app, "Which items increased the most?", {
      type: "insight_lookup", category: "Item",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.insufficient_data).toBe(true);
    expect(body.answer).toMatch(/No insights were found in the Item category/);
    expect(body.result.total_found).toBe(0);
    // Only the classification call happened - the empty-result path never
    // calls Gemini a second time to "explain" nothing.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // ---- Gemini unavailable (network/timeout) degrades honestly ----

  it("degrades to a typed unavailable result (still HTTP 200) when Gemini's classification call fails", async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/intelligence/ask",
      headers: AUTH,
      payload: { question: "How is AI performing right now, distinct cache key" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("unavailable");
    expect(typeof body.reason).toBe("string");
    expect(body.intent).toBeNull();
  });

  // ---- Reuses geminiClient.ts's exact safety-instruction convention ----

  it("sends the exact same SAFETY_INSTRUCTIONS text as Phase 14's explain/briefing calls on the classification request", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(geminiOkResponse(JSON.stringify({ type: "ai_quality_summary" })));
    await app.inject({
      method: "POST",
      url: "/api/admin/intelligence/ask",
      headers: AUTH,
      payload: { question: "How is AI performing, another distinct cache key" },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe(SAFETY_INSTRUCTIONS);
  });

  it("caches an identical classification - a second identical question within the TTL does not re-classify", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(geminiOkResponse(JSON.stringify({ type: "ai_quality_summary" })));
    const q = "How is AI performing, cache test unique phrasing";
    const first = await app.inject({ method: "POST", url: "/api/admin/intelligence/ask", headers: AUTH, payload: { question: q } });
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await app.inject({ method: "POST", url: "/api/admin/intelligence/ask", headers: AUTH, payload: { question: q } });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    // Both the classification call (keyed by question text) and the
    // answer call (keyed by the exact intent+facts pair) are
    // content-addressed - an identical repeat re-uses both, making zero
    // new live calls.
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });
});
