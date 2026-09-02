// Phase 14 (Gemini Intelligence Layer): the ONLY module in this repo that
// talks to Gemini. A plain typed fetch() wrapper around Gemini's REST API
// - no @google/generative-ai (or any other) SDK dependency, matching this
// BFF's existing minimal-dependency, fetch-based convention (see
// httpClient.ts, which backendClient.ts/catalogClient.ts already build
// on - this module doesn't reuse httpClient.ts itself since Gemini's API
// shape/auth (a `?key=` query param, POST body, model-specific URL) is
// different enough from those services' GET-with-header pattern that a
// shared abstraction would just be indirection).
//
// Model: "gemini-3.1-flash-lite" - the exact model
// vendo-app/backend/app/config.py's `gemini_model` setting already names
// for the existing Python backend's own Gemini usage (see
// app/services/gemini_transcriber.py) - same model, deliberately
// different SDK: that service is Python and already depends on
// google-genai; this BFF is TypeScript and deliberately dependency-light,
// so a typed fetch wrapper replaces the SDK call for consistency with the
// rest of *this* codebase, not that one.
//
// This phase's own explicit rule: Gemini must NEVER invent numbers,
// customers/orders, price/revenue, causes, or predictions, and must never
// become the source of numerical truth - it only ever restates/explains
// facts a caller hands it. This module enforces the literal, mechanical
// half of that rule: every public function here accepts only a small,
// already-bounded "facts" object (see InsightFacts below) built by the
// caller from a single already-verified Insight - never a raw DB row,
// never an unbounded object graph, and this module never queries
// anything itself. SAFETY_INSTRUCTIONS is the other half - the actual
// prompt text asking the model to honor the same rule - written once
// here and reused verbatim by both the per-insight and briefing prompts.
import { config } from "../config.js";

const MODEL = "gemini-3.1-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// A few seconds, per the phase's own "must not hang the page" guidance -
// long enough for a short-generation call to a "flash-lite" model, short
// enough that a hung/slow Gemini call can never stall a page render
// behind it (every caller of this module treats a timeout exactly like
// any other failure - a typed "unavailable" result, never a thrown error
// left to propagate).
const GEMINI_TIMEOUT_MS = 8_000;

// Response sanity bounds (the phase's "guard against obviously malformed
// or empty responses" requirement) - a real short explanation is a
// sentence or two (per-insight) or a short paragraph (briefing, capped at
// a few sentences by the prompt itself); anything empty or wildly long is
// treated as malformed rather than rendered as-is. This is NOT a
// fact-check against the source numbers (the phase spec explicitly calls
// that infeasible to do robustly) - just a floor/ceiling on "does this
// look like a short explanation at all."
const MIN_RESPONSE_LENGTH = 8;
const MAX_RESPONSE_LENGTH = 2000;

// Written once, reused verbatim by every prompt this module builds for
// either the per-insight explain call or the manager briefing call -
// never duplicated or re-worded per call site. Sent via Gemini's REST API
// `systemInstruction` field - the closest thing this API has to a strong,
// distinct system role (there is no separate "system" message in
// `contents`; `systemInstruction` is the documented field for
// model-level behavioral instructions that sit outside the user turn).
export const SAFETY_INSTRUCTIONS =
  "You are an analytics assistant embedded in an internal fleet-operations dashboard. " +
  "You will be given a small JSON object containing already-verified facts and numbers computed by the " +
  "platform's own analytics engine. Follow these rules strictly:\n" +
  "1. Only reference facts, numbers, and entities that are present in the supplied JSON. Never invent, " +
  "estimate, guess, extrapolate, or predict a number, customer, order, or entity that is not explicitly there.\n" +
  "2. Never mention price, revenue, monetary value, cost, or any dollar/currency amount in any form, even if " +
  "you believe it would help - this platform never exposes that data and you must never imply, infer, or " +
  "back-calculate it.\n" +
  "3. If asked to explain a cause, describe only the pattern already shown in the data (e.g. how a value " +
  "relates to its baseline) - never assert an unproven cause, motive, or explanation for WHY something " +
  "happened.\n" +
  "4. Write in plain, concise, professional language suitable for a fleet manager. Keep it short.\n" +
  "5. If the supplied JSON does not contain enough information to say something useful, say so plainly rather " +
  "than filling the gap with speculation.";

export type GeminiResult =
  | { status: "ok"; text: string; cached: boolean; generatedAt: string }
  | { status: "unavailable"; reason: string; cached: boolean; generatedAt: string };

type RawGeminiResult = { status: "ok"; text: string } | { status: "unavailable"; reason: string };

interface CacheEntry {
  result: GeminiResult;
  expiresAt: number;
}

// In-memory content-addressed cache - same Map + TTL pattern
// plugins/auth.ts already uses for its own short-lived admin-identity
// cache. Keyed by a stable JSON stringification of the exact facts sent
// to Gemini (object literals in this module always list keys in the same
// fixed order, so JSON.stringify is already stable here - no separate
// hash step needed).
//
// Two TTL tiers, chosen deliberately:
//
// - INSIGHT_EXPLANATION_TTL_MS (12h): per-insight explanations are keyed
//   by that insight's own facts (buildInsightFacts below deliberately
//   excludes the volatile `timestamp` field a fresh /insights response
//   stamps on every request, and the internal-only `drill_down` URL - see
//   InsightFacts) - so the SAME underlying signal (same category/title/
//   metric/values/entity) hits this cache across repeated page loads
//   within a work day, while a genuinely different signal (different
//   numbers) is simply a different cache key, never a stale explanation
//   served for new facts. 12h is longer than a single admin session on
//   purpose (this is "explanations rarely change within a session," per
//   the phase's own hint, applied generously) while still bounding
//   memory growth and letting next-day re-runs (fresh data) get a fresh
//   entry once the old one ages out.
// - BRIEFING_TTL_MS (24h): the manager briefing is regenerated at most
//   once per calendar day for a given insight-set, regardless of how many
//   times the Command Center is loaded that day - the phase's explicit
//   "minimize free-API usage ... never call Gemini for every chart"
//   requirement, applied to the one endpoint most likely to be polled
//   repeatedly (a dashboard card). Also content-addressed (keyed by the
//   exact insight facts list handed in), so a genuinely different
//   insight-set (something changed) still gets a fresh briefing rather
//   than being stuck behind yesterday's summary for a full day.
// - FAILURE_TTL_MS (60s): an "unavailable" result (network error,
//   non-200, timeout, malformed response) is cached only briefly - long
//   enough to stop a burst of page loads from hammering a down/slow
//   Gemini, short enough that a transient blip doesn't leave the UI
//   showing "AI unavailable" for the rest of the (12h/24h) success TTL
//   once Gemini recovers.
export const INSIGHT_EXPLANATION_TTL_MS = 12 * 60 * 60 * 1000;
export const BRIEFING_TTL_MS = 24 * 60 * 60 * 1000;
export const FAILURE_TTL_MS = 60 * 1000;

const cache = new Map<string, CacheEntry>();

function pruneExpired(now: number) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function getCached(key: string): GeminiResult | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return { ...entry.result, cached: true };
}

function setCached(key: string, result: GeminiResult, ttlMs: number) {
  const now = Date.now();
  if (cache.size > 1000) pruneExpired(now);
  cache.set(key, { result: { ...result, cached: false }, expiresAt: now + ttlMs });
}

function isMalformed(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length < MIN_RESPONSE_LENGTH || trimmed.length > MAX_RESPONSE_LENGTH;
}

interface GeminiPart {
  text?: string;
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}
interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
}

function extractText(json: unknown): string | null {
  const resp = json as GeminiGenerateContentResponse;
  const candidates = resp?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
  return text.length > 0 ? text : null;
}

// The single fetch() call site to Gemini's REST API - every safety net
// (missing key, network error, non-200, timeout, malformed/empty
// response) is handled here so no caller ever needs its own try/catch
// around a Gemini call. Never throws.
async function callGemini(promptText: string): Promise<RawGeminiResult> {
  if (!config.geminiApiKey) {
    return { status: "unavailable", reason: "GEMINI_API_KEY is not configured" };
  }

  const url = `${API_BASE}/${MODEL}:generateContent?key=${config.geminiApiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: SAFETY_INSTRUCTIONS }] },
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "unavailable", reason: `network error calling Gemini: ${message}` };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    return { status: "unavailable", reason: `Gemini responded ${res.status}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { status: "unavailable", reason: "Gemini response was not valid JSON" };
  }

  const text = extractText(json);
  if (text === null || isMalformed(text)) {
    return { status: "unavailable", reason: "Gemini response was empty or malformed" };
  }

  return { status: "ok", text: text.trim() };
}

async function callGeminiCached(key: string, successTtlMs: number, promptText: string): Promise<GeminiResult> {
  const cached = getCached(key);
  if (cached) return cached;

  const raw = await callGemini(promptText);
  const generatedAt = new Date().toISOString();
  const result: GeminiResult =
    raw.status === "ok"
      ? { status: "ok", text: raw.text, cached: false, generatedAt }
      : { status: "unavailable", reason: raw.reason, cached: false, generatedAt };

  setCached(key, result, raw.status === "ok" ? successTtlMs : FAILURE_TTL_MS);
  return result;
}

// ---------------------------------------------------------------------
// Per-insight explanation
// ---------------------------------------------------------------------

// The ONLY fields ever sent to Gemini for a per-insight explanation -
// deliberately a subset of insightEngine.ts's `Insight` interface.
// `timestamp` (when this API response was generated, not a fact about
// the underlying signal) and `drill_down` (an internal app URL) are left
// out on purpose - neither is a fact to explain, and including
// `timestamp` in particular would defeat the content-addressed cache
// above (a fresh /insights fetch stamps a new timestamp on every
// response even when the underlying signal hasn't changed). Nothing
// outside this one insight's own fields is ever included here - no other
// insight, no raw DB access, no extra context - the literal enforcement
// of this phase's "only send structured, already-verified data" rule.
export interface InsightFacts {
  category: string;
  severity: string;
  title: string;
  explanation: string;
  metric: string;
  current_value: number;
  baseline: number;
  change_abs: number;
  change_pct: number | null;
  sample_size: number;
  affected_entity: string;
}

interface InsightLike {
  category: string;
  severity: string;
  title: string;
  explanation: string;
  metric: string;
  current_value: number;
  baseline: number;
  change_abs: number;
  change_pct: number | null;
  sample_size: number;
  affected_entity: string;
}

export function buildInsightFacts(insight: InsightLike): InsightFacts {
  const {
    category, severity, title, explanation, metric,
    current_value, baseline, change_abs, change_pct, sample_size, affected_entity,
  } = insight;
  return { category, severity, title, explanation, metric, current_value, baseline, change_abs, change_pct, sample_size, affected_entity };
}

function insightPrompt(facts: InsightFacts): string {
  return (
    "Task: in 1-3 short sentences, explain this single evidence-backed insight in plain language for a fleet " +
    "manager, using ONLY the facts below. Do not add any fact, number, or entity not present here.\n\n" +
    `Insight JSON:\n${JSON.stringify(facts)}`
  );
}

export function explainInsight(facts: InsightFacts): Promise<GeminiResult> {
  const key = `insight:${JSON.stringify(facts)}`;
  return callGeminiCached(key, INSIGHT_EXPLANATION_TTL_MS, insightPrompt(facts));
}

// ---------------------------------------------------------------------
// Manager briefing
// ---------------------------------------------------------------------

function briefingPrompt(factsList: InsightFacts[]): string {
  return (
    "Task: you are given the CURRENT full list of evidence-backed insights the platform's analytics engine has " +
    "flagged, each already carrying its own category/severity/metric/values/sample size. Write a short " +
    "(3-6 sentence) manager briefing summarizing what is most worth attention right now, grouped or prioritized " +
    "however you judge clearest. Use ONLY the entities, numbers, and categories present in this list - do not " +
    "mention any insight, entity, or number not present here. If the list is empty, say plainly that nothing is " +
    "currently flagged rather than inventing something to report.\n\n" +
    `Insights JSON:\n${JSON.stringify(factsList)}`
  );
}

export function generateBriefing(factsList: InsightFacts[]): Promise<GeminiResult> {
  const key = `briefing:${JSON.stringify(factsList)}`;
  return callGeminiCached(key, BRIEFING_TTL_MS, briefingPrompt(factsList));
}

// ---------------------------------------------------------------------
// Generic prompt call (Phase 15, Ask VeNdO Intelligence)
// ---------------------------------------------------------------------

// Ask VeNdO needs two Gemini calls that don't fit either fixed shape
// above: (1) classify a free-text question into one of a small, closed
// set of structured intents, and (2) explain an already-verified result
// for one of those intents. Neither is an InsightFacts object, so
// explainInsight/generateBriefing don't apply - but per this module's own
// "the ONLY module in this repo that talks to Gemini" rule, Ask VeNdO
// must not open a second fetch()/HTTP wrapper of its own either. This is
// the single additive export that lets it reuse the exact same
// call/cache/timeout/malformed-response machinery above (callGemini,
// callGeminiCached, SAFETY_INSTRUCTIONS via callGemini's
// systemInstruction) for caller-built prompt text, keyed and ttl'd by the
// caller. All prompt construction and response validation for Ask VeNdO
// stays in backend/src/lib/askEngine.ts - this function only forwards.
export function callGeminiWithPrompt(cacheKey: string, ttlMs: number, promptText: string): Promise<GeminiResult> {
  return callGeminiCached(cacheKey, ttlMs, promptText);
}

// Test-only: clears the module-level cache so caching assertions in one
// test (e.g. "a second call within the TTL doesn't re-fetch") don't leak
// state into another. Not used anywhere outside backend/test/.
export function __resetCacheForTests(): void {
  cache.clear();
}
