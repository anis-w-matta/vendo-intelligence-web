// Phase 14 (Gemini Intelligence Layer) - route-level tests for
// POST /api/admin/intelligence/insights/explain and
// GET /api/admin/intelligence/briefing. Drives the real Fastify app via
// app.inject() exactly like routes.spec.ts, with backendClient/
// catalogClient mocked (mockAllClients, same as every other route test)
// and global fetch stubbed so the ONLY network call this file ever makes
// is the mocked one to Gemini's REST endpoint - never a real call.
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

const fetchMock = vi.fn().mockResolvedValue(geminiOkResponse("A short, plain-language explanation of the pattern shown."));
vi.stubGlobal("fetch", fetchMock);

const { buildApp } = await import("../src/server.js");
const { __resetCacheForTests } = await import("../src/lib/geminiClient.js");

const AUTH = { authorization: "Bearer test-token" };

const SAMPLE_INSIGHT = {
  category: "Sales",
  severity: "WARNING",
  title: "Rejection rate well above the fleet average",
  explanation: "Investigate: Ahmed (sm_a)'s rejection rate is 25.0%, vs. a fleet average of 12.5% across 5 active salesmen (2.00x).",
  metric: "Rejection rate vs. fleet average",
  current_value: 0.25,
  baseline: 0.125,
  change_abs: 0.125,
  change_pct: 100,
  sample_size: 5,
  affected_entity: "Ahmed (sm_a)",
  timestamp: "2026-09-01T00:00:00.000Z",
  drill_down: "/salesmen/sm_a",
};

describe("POST /api/admin/intelligence/insights/explain", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  beforeEach(() => {
    __resetCacheForTests();
  });

  it("returns 401 with no bearer token", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/intelligence/insights/explain", payload: SAMPLE_INSIGHT });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 for a malformed insight body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/intelligence/insights/explain",
      headers: AUTH,
      payload: { title: "missing everything else" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when the body carries an extra, unrecognized field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/intelligence/insights/explain",
      headers: AUTH,
      payload: { ...SAMPLE_INSIGHT, price: 99 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns a 200 with an ok explanation for a well-formed insight", async () => {
    fetchMock.mockClear();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/intelligence/insights/explain",
      headers: AUTH,
      payload: SAMPLE_INSIGHT,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.explanation).toBe("string");
    expect(body.explanation.length).toBeGreaterThan(0);
  });

  it("sends Gemini ONLY this insight's own fields - no timestamp, no drill_down, no other insight's data", async () => {
    fetchMock.mockClear();
    await app.inject({
      method: "POST",
      url: "/api/admin/intelligence/insights/explain",
      headers: AUTH,
      payload: SAMPLE_INSIGHT,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(init.body as string);
    const promptText: string = requestBody.contents[0].parts[0].text;

    // The exact facts payload embedded in the prompt - every field
    // present, and (critically) `timestamp`/`drill_down` absent.
    const factsMatch = promptText.match(/Insight JSON:\n([\s\S]+)$/);
    expect(factsMatch).not.toBeNull();
    const facts = JSON.parse(factsMatch![1]);
    expect(facts).toEqual({
      category: SAMPLE_INSIGHT.category,
      severity: SAMPLE_INSIGHT.severity,
      title: SAMPLE_INSIGHT.title,
      explanation: SAMPLE_INSIGHT.explanation,
      metric: SAMPLE_INSIGHT.metric,
      current_value: SAMPLE_INSIGHT.current_value,
      baseline: SAMPLE_INSIGHT.baseline,
      change_abs: SAMPLE_INSIGHT.change_abs,
      change_pct: SAMPLE_INSIGHT.change_pct,
      sample_size: SAMPLE_INSIGHT.sample_size,
      affected_entity: SAMPLE_INSIGHT.affected_entity,
    });
    expect(promptText).not.toContain(SAMPLE_INSIGHT.timestamp);
    expect(promptText).not.toContain(SAMPLE_INSIGHT.drill_down);
    // Note: the safety-instruction block itself legitimately mentions
    // "price"/"revenue" (it's the text telling Gemini never to use them)
    // - the real no-leakage guarantee checked above is that the *facts*
    // JSON embedded in the prompt is exactly this one insight's own
    // fields, nothing more.
  });

  it("degrades to a typed unavailable result (still HTTP 200) when Gemini errors, never throwing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/intelligence/insights/explain",
      headers: AUTH,
      payload: { ...SAMPLE_INSIGHT, title: "A distinct title to bypass the cache" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("unavailable");
    expect(typeof body.reason).toBe("string");
  });
});

describe("GET /api/admin/intelligence/briefing", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  beforeEach(() => {
    __resetCacheForTests();
  });

  it("returns 401 with no bearer token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/briefing" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with an ok briefing built from the current real insight list", async () => {
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(geminiOkResponse("Nothing critical is currently flagged across the fleet."));
    const res = await app.inject({ method: "GET", url: "/api/admin/intelligence/briefing", headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.briefing).toBe("string");
    expect(typeof body.insight_count).toBe("number");
    expect(typeof body.generated_at).toBe("string");
  });

  it("caches the briefing - a second request within the TTL does not call Gemini again", async () => {
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(geminiOkResponse("Nothing critical is currently flagged across the fleet."));
    const first = await app.inject({ method: "GET", url: "/api/admin/intelligence/briefing", headers: AUTH });
    const second = await app.inject({ method: "GET", url: "/api/admin/intelligence/briefing", headers: AUTH });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.json().cached).toBe(true);
  });
});
