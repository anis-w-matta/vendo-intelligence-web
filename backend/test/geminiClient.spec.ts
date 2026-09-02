// Phase 14 (Gemini Intelligence Layer) - geminiClient.ts's own unit
// tests. The real Gemini REST endpoint is NEVER called here: global
// fetch is always stubbed (vi.stubGlobal), and backend/src/config.js is
// mocked per test via vi.doMock + vi.resetModules() so each scenario
// (API key present/missing) gets a fresh module instance with its own
// empty in-memory cache - no test's caching assertions can leak into
// another's.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InsightFacts } from "../src/lib/geminiClient.js";

const SAMPLE_FACTS: InsightFacts = {
  category: "Sales",
  severity: "WARNING",
  title: "Rejection rate well above the fleet average",
  explanation: "Investigate: sm_a (Ahmed)'s rejection rate is 25.0%, vs. a fleet average of 12.5%.",
  metric: "Rejection rate vs. fleet average",
  current_value: 0.25,
  baseline: 0.125,
  change_abs: 0.125,
  change_pct: 100,
  sample_size: 7,
  affected_entity: "Ahmed (sm_a)",
};

function geminiOkResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  } as Response;
}

async function loadGeminiClient(apiKey: string | undefined) {
  vi.resetModules();
  vi.doMock("../src/config.js", () => ({
    config: {
      backendUrl: "http://127.0.0.1:8000",
      catalogUrl: "http://127.0.0.1:8100",
      backendApiKey: undefined,
      catalogApiKey: undefined,
      geminiApiKey: apiKey,
      port: 8200,
    },
  }));
  return import("../src/lib/geminiClient.js");
}

describe("geminiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("produces an unavailable result without throwing, and without calling fetch, when GEMINI_API_KEY is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient(undefined);

    const result = await explainInsight(SAMPLE_FACTS);

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toMatch(/GEMINI_API_KEY/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes the exact safety-instruction text in every outgoing request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOkResponse("A short plain-language explanation of the pattern."));
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight, generateBriefing, SAFETY_INSTRUCTIONS } = await loadGeminiClient("test-key");

    await explainInsight(SAMPLE_FACTS);
    await generateBriefing([SAMPLE_FACTS]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.systemInstruction.parts[0].text).toBe(SAFETY_INSTRUCTIONS);
    }
  });

  it("hits Gemini's generateContent endpoint for the configured model via POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOkResponse("A short explanation."));
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient("test-key");

    await explainInsight(SAMPLE_FACTS);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gemini-3.1-flash-lite:generateContent");
    expect(url).toContain("key=test-key");
    expect(init.method).toBe("POST");
  });

  it("caches a successful explanation - a second call with the same facts within the TTL does not re-fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOkResponse("A short explanation."));
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient("test-key");

    const first = await explainInsight(SAMPLE_FACTS);
    const second = await explainInsight(SAMPLE_FACTS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.status).toBe("ok");
    expect(first.cached).toBe(false);
    expect(second.status).toBe("ok");
    expect(second.cached).toBe(true);
    if (first.status === "ok" && second.status === "ok") {
      expect(second.text).toBe(first.text);
    }
  });

  it("caches a briefing per exact insight-set - a second call with the same list does not re-fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOkResponse("Nothing urgent to flag today."));
    vi.stubGlobal("fetch", fetchMock);
    const { generateBriefing } = await loadGeminiClient("test-key");

    const list = [SAMPLE_FACTS];
    await generateBriefing(list);
    await generateBriefing(list);
    // A different insight-set is a different cache key - one more real call.
    await generateBriefing([]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("produces an unavailable result without throwing on a non-200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient("test-key");

    const result = await explainInsight(SAMPLE_FACTS);

    expect(result.status).toBe("unavailable");
  });

  it("produces an unavailable result without throwing on a 429 rate-limit response", async () => {
    // Phase 17 certification gap: the generic non-200 test above used 503;
    // Gemini's actual rate-limit status is 429 specifically, and the phase
    // acceptance checklist calls it out by name - verify it goes through
    // the same "unavailable", not a crash, without special-casing 429.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 429, message: "Resource has been exhausted", status: "RESOURCE_EXHAUSTED" } }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient("test-key");

    const result = await explainInsight(SAMPLE_FACTS);

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBeTruthy();
    }
  });

  it("produces an unavailable result without throwing on a network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient("test-key");

    const result = await explainInsight(SAMPLE_FACTS);

    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toMatch(/network error/);
    }
  });

  it("treats an empty response as unavailable rather than rendering it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOkResponse(""));
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient("test-key");

    const result = await explainInsight(SAMPLE_FACTS);

    expect(result.status).toBe("unavailable");
  });

  it("treats a response with no candidates as unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient("test-key");

    const result = await explainInsight(SAMPLE_FACTS);

    expect(result.status).toBe("unavailable");
  });

  it("treats a response body that isn't valid JSON as unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid json");
      },
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient("test-key");

    const result = await explainInsight(SAMPLE_FACTS);

    expect(result.status).toBe("unavailable");
  });

  it("treats an improbably long response as malformed and unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOkResponse("x".repeat(5000)));
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient("test-key");

    const result = await explainInsight(SAMPLE_FACTS);

    expect(result.status).toBe("unavailable");
  });

  it("aborts and reports unavailable when Gemini never responds within the timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { explainInsight } = await loadGeminiClient("test-key");

    const pending = explainInsight(SAMPLE_FACTS);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;

    expect(result.status).toBe("unavailable");
    vi.useRealTimers();
  });
});
