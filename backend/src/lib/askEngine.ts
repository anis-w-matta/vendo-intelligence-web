// Phase 15 (Ask VeNdO Intelligence): Question -> Gemini classification ->
// validated structured intent -> execution against an existing, already-
// verified data source -> Gemini explanation of the verified result.
//
// Gemini's role here is STRICTLY the two things the phase spec names:
// (1) classify a free-text question into one of a small, closed set of
//     structured intents defined below (AskIntent) - it never executes
//     logic itself and never invents a metric/field/category name outside
//     this enum.
// (2) explain an already-verified result, exactly like Phase 14's
//     "explain this insight"/briefing pattern (buildInsightFacts /
//     explainInsight / generateBriefing in geminiClient.ts) - grounded
//     only in the bounded facts object this module builds, never raw data.
//
// This module NEVER trusts Gemini's classification output directly.
// parseAskIntent() below re-validates it against a strict, closed zod
// schema before anything is ever executed - an out-of-enum metric/
// category, a malformed response, or a response that fails to parse as
// JSON at all is always treated as `{ type: "unsupported" }`, never
// crashes, and never falls through to execution. This is the literal
// enforcement of "closed-world" query intents: there is no code path from
// a free-text question to a raw DB/analytics call that does not pass
// through this validator first.
//
// Execution reuses the SAME already-verified data sources every other
// page in this app already renders (salesmen.ts, insights.ts,
// aiQuality.ts, operations.ts, dataHealth.ts) - via app.inject(), the
// same in-process pattern geminiExplain.ts's briefing endpoint already
// uses to re-run insights.ts without duplicating its upstream fan-out.
// This module has no upstream (backendClient/catalogClient) calls of its
// own and computes no new business number - every number an AskIntent
// produces was already computed by one of those routes.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Insight, InsightCategory } from "./insightEngine.js";
import type { Envelope } from "./metricContract.js";

// ---------------------------------------------------------------------
// The closed intent schema - the ONLY shapes Gemini's classification can
// ever resolve to. No free-form "metric" string, no arbitrary SQL-like
// construction. Every non-"unsupported" variant maps to exactly one
// already-existing, already-verified BFF route.
// ---------------------------------------------------------------------

export const SALESMAN_RANKING_METRICS = [
  "order_count",
  "item_quantity",
  "rejection_rate",
  "median_turnaround_seconds",
  "ai_correction_rate",
] as const;
export type SalesmanRankingMetric = (typeof SALESMAN_RANKING_METRICS)[number];

export const INSIGHT_CATEGORIES = ["Sales", "Customer", "Item", "Operations", "AI", "Data Quality"] as const;

export type AskIntent =
  | {
      type: "salesman_ranking";
      metric: SalesmanRankingMetric;
      sort: "desc" | "asc";
      limit: number;
      // "This month"-style questions (worked example 1: "Who created the
      // most orders this month?") need a real date range - but Gemini
      // never supplies raw date strings (it could hallucinate an
      // incorrect "today"). It only ever picks one of these two enum
      // values; executeAskIntent below computes the actual ISO
      // date_from/date_to itself from the server's real current time.
      timeframe: "current_month" | "all_time";
    }
  | { type: "insight_lookup"; category: InsightCategory }
  | { type: "ai_quality_summary" }
  | { type: "operations_summary" }
  | { type: "data_health_summary" }
  | { type: "unsupported"; reason: string };

const SalesmanRankingIntentSchema = z
  .object({
    type: z.literal("salesman_ranking"),
    metric: z.enum(SALESMAN_RANKING_METRICS),
    sort: z.enum(["desc", "asc"]).default("desc"),
    limit: z.number().int().min(1).max(50).default(5),
    timeframe: z.enum(["current_month", "all_time"]).default("all_time"),
  })
  .strict();

const InsightLookupIntentSchema = z
  .object({ type: z.literal("insight_lookup"), category: z.enum(INSIGHT_CATEGORIES) })
  .strict();

const AiQualitySummaryIntentSchema = z.object({ type: z.literal("ai_quality_summary") }).strict();
const OperationsSummaryIntentSchema = z.object({ type: z.literal("operations_summary") }).strict();
const DataHealthSummaryIntentSchema = z.object({ type: z.literal("data_health_summary") }).strict();

const UnsupportedIntentSchema = z
  .object({ type: z.literal("unsupported"), reason: z.string().min(1).max(300) })
  .strict();

const AskIntentSchema = z.discriminatedUnion("type", [
  SalesmanRankingIntentSchema,
  InsightLookupIntentSchema,
  AiQualitySummaryIntentSchema,
  OperationsSummaryIntentSchema,
  DataHealthSummaryIntentSchema,
  UnsupportedIntentSchema,
]);

const GENERIC_UNSUPPORTED_REASON =
  "This question could not be matched to a supported analytics query. VeNdO Intelligence only answers questions " +
  "about salesman rankings (orders, item quantity, rejection rate, turnaround, AI correction rate), category " +
  "insights (Sales/Customer/Item/Operations/AI/Data Quality), AI quality, operations, or data health - never " +
  "price, revenue, monetary value, or order value, which this platform does not track.";

// The one place Gemini's classification output ever gets trusted -
// re-validated against the exact closed schema above. `raw` is whatever
// parseGeminiJson() below produced (possibly `undefined` if Gemini's text
// wasn't valid JSON at all) - never assumed to already be well-shaped.
// Always returns a valid AskIntent, never throws, and always falls back
// to `unsupported` on anything that doesn't cleanly validate - an
// out-of-enum metric/category, an extra field, a wrong type, or a
// completely malformed/non-JSON response are all indistinguishable from
// "safely reject" here.
export function parseAskIntent(raw: unknown): AskIntent {
  const parsed = AskIntentSchema.safeParse(raw);
  if (!parsed.success) {
    return { type: "unsupported", reason: GENERIC_UNSUPPORTED_REASON };
  }
  return parsed.data;
}

// Gemini is asked for ONLY a JSON object, but models occasionally wrap it
// in a ```json fence despite instructions - stripped defensively. Returns
// `undefined` (never throws) if the text can't be turned into a JSON
// value at all, which parseAskIntent above then safely resolves to
// `unsupported`.
export function parseGeminiJson(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

// ---------------------------------------------------------------------
// Classification prompt - the exact enumerated shapes, spelled out
// literally so Gemini has no ambiguity about what exists. Explicitly
// tells Gemini to classify ANY financial/price/revenue/monetary/order-
// value question (or anything else it doesn't fit) as `unsupported`
// rather than guess - this is a prompt-level instruction, not the safety
// mechanism itself (parseAskIntent's validator is the actual enforcement;
// this prompt just gives Gemini its best shot at getting there itself).
// ---------------------------------------------------------------------

export function buildClassificationPrompt(question: string, todayIso: string): string {
  return (
    "Task: classify the user question below into EXACTLY ONE of the JSON shapes listed. Respond with ONLY that " +
    "one JSON object - no markdown code fences, no extra prose, no explanation before or after it.\n\n" +
    "These are the ONLY shapes that exist. Never invent a field, metric, or category not listed here:\n" +
    '1. {"type":"salesman_ranking","metric":"order_count"|"item_quantity"|"rejection_rate"|"median_turnaround_seconds"|"ai_correction_rate","sort":"desc"|"asc","limit":<integer 1-50>,"timeframe":"current_month"|"all_time"}\n' +
    '2. {"type":"insight_lookup","category":"Sales"|"Customer"|"Item"|"Operations"|"AI"|"Data Quality"}\n' +
    '3. {"type":"ai_quality_summary"}\n' +
    '4. {"type":"operations_summary"}\n' +
    '5. {"type":"data_health_summary"}\n' +
    '6. {"type":"unsupported","reason":"<short plain-language reason, one sentence>"}\n\n' +
    "Rules:\n" +
    "- This platform has NO price, revenue, monetary value, cost, or order-value data anywhere. ANY question " +
    "asking about those - or anything else that doesn't clearly fit shapes 1-5 - MUST be classified as shape 6 " +
    "(unsupported), with a short honest reason. Never guess a best-effort mapping for a question you are not " +
    "confident about.\n" +
    '- Use timeframe "current_month" only when the question explicitly references the current month/period (e.g. ' +
    '"this month", "this period"); otherwise use "all_time".\n' +
    '- "Declining", "increased the most", "high", "most", "backlog", "worse" and similar comparative/trend ' +
    "language usually map to insight_lookup with the category that best matches the subject (Customer, Item, " +
    "Operations, etc.) - those categories already carry evidence-backed trend/anomaly signals.\n" +
    `- Today's date is ${todayIso}.\n\n` +
    `User question: ${question}`
  );
}

// ---------------------------------------------------------------------
// Execution - dispatches a validated AskIntent to the one existing route
// it maps to, via app.inject() (same in-process pattern
// geminiExplain.ts's briefing endpoint already uses for insights.ts).
// Every branch returns either a typed "unavailable" (the upstream route
// itself failed/degraded) or a bounded `facts` object - the ONLY thing
// ever handed to Gemini for the explanation call - plus a `displayResult`
// (usually the same object) shown to the admin for transparency, an
// `empty` flag, and a deterministic, honest message to use when `empty`
// is true so an admin question about missing data never depends on
// Gemini to say so.
// ---------------------------------------------------------------------

export type AskExecution =
  | { status: "unavailable"; reason: string }
  | { status: "ok"; empty: boolean; insufficientMessage: string; facts: unknown; displayResult: unknown };

interface SalesmanRowLike {
  salesman_id: string;
  salesman_name: string | null;
  order_count: number;
  item_quantity: string;
  rejection_rate: number | null;
  median_turnaround_seconds: number | null;
  ai_correction_rate: number | null;
}

interface InsightsRouteResponseLike {
  insights: Insight[];
  status: string;
  note: string;
}

interface AiQualitySummaryLike {
  reviewed_lines: number;
  edited_lines: number;
  overall_correction_rate: number | null;
  low_confidence_count: number;
  by_confidence_bucket: { bucket: string; sample_size: number; correction_rate: number | null }[];
}

interface OperationsSummaryLike {
  backlog: { total: number; oldest_created_at: string | null; age_buckets: Record<string, number> };
  turnaround: {
    sample_size: number;
    median_seconds: number | null;
    avg_seconds: number | null;
    p90_seconds: number | null;
  };
  rejection: { sample_size: number; rejection_rate: number | null; previous_period_rejection_rate: number | null };
}

interface DataHealthSummaryLike {
  completeness: Record<string, { count?: number; total: number; pct?: number | null; status: string; note?: string }>;
  duplicate_orders: { groups: number; heuristic: string; caveat: string };
  legacy_data_limitations: string[];
}

async function injectJson<T>(
  app: FastifyInstance,
  authorization: string,
  url: string,
  query?: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  const res = await app.inject({ method: "GET", url, query, headers: { authorization } });
  if (res.statusCode !== 200) {
    return { ok: false, reason: `underlying analytics service returned ${res.statusCode} for ${url}` };
  }
  return { ok: true, data: res.json() as T };
}

function currentMonthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function salesmanMetricValue(row: SalesmanRowLike, metric: SalesmanRankingMetric): number | null {
  switch (metric) {
    case "order_count":
      return row.order_count;
    case "item_quantity": {
      const n = Number(row.item_quantity);
      return Number.isFinite(n) ? n : null;
    }
    case "rejection_rate":
      return row.rejection_rate;
    case "median_turnaround_seconds":
      return row.median_turnaround_seconds;
    case "ai_correction_rate":
      return row.ai_correction_rate;
  }
}

// Ranking list is capped to keep the explanation prompt small; a genuine
// "top N" request already caps itself via `limit` (max 50 per the
// validator above), but this is a belt-and-suspenders bound on what's
// ever sent to Gemini specifically.
const ASK_MAX_INSIGHTS = 8;
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 3, WARNING: 2, WATCH: 1, INFO: 0 };

export async function executeAskIntent(
  app: FastifyInstance,
  authorization: string,
  intent: Exclude<AskIntent, { type: "unsupported" }>,
  now: Date,
): Promise<AskExecution> {
  switch (intent.type) {
    case "salesman_ranking": {
      const query =
        intent.timeframe === "current_month"
          ? { date_from: currentMonthStartIso(now), date_to: now.toISOString() }
          : undefined;
      const res = await injectJson<Envelope<SalesmanRowLike[]>>(
        app,
        authorization,
        "/api/admin/intelligence/salesmen",
        query,
      );
      if (!res.ok) return { status: "unavailable", reason: res.reason };

      const withValues = res.data.data
        .map((row) => ({
          salesman_id: row.salesman_id,
          salesman_name: row.salesman_name,
          value: salesmanMetricValue(row, intent.metric),
        }))
        .filter((r): r is { salesman_id: string; salesman_name: string | null; value: number } => r.value !== null);

      withValues.sort((a, b) => (intent.sort === "desc" ? b.value - a.value : a.value - b.value));
      const ranked = withValues.slice(0, intent.limit);

      const shared = {
        metric: intent.metric,
        sort: intent.sort,
        limit: intent.limit,
        timeframe: intent.timeframe,
        period: query ?? null,
        total_salesmen_with_data: withValues.length,
        ranked,
      };

      return {
        status: "ok",
        empty: ranked.length === 0,
        insufficientMessage:
          `Not enough data to answer this: no salesman currently has a recorded value for "${intent.metric}"` +
          (intent.timeframe === "current_month" ? " in the current month." : "."),
        facts: shared,
        displayResult: shared,
      };
    }

    case "insight_lookup": {
      const res = await injectJson<InsightsRouteResponseLike>(app, authorization, "/api/admin/intelligence/insights");
      if (!res.ok) return { status: "unavailable", reason: res.reason };

      const matches = res.data.insights.filter((i) => i.category === intent.category);
      const sorted = [...matches].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
      const capped = sorted.slice(0, ASK_MAX_INSIGHTS).map((i) => ({
        severity: i.severity,
        title: i.title,
        explanation: i.explanation,
        metric: i.metric,
        current_value: i.current_value,
        baseline: i.baseline,
        change_abs: i.change_abs,
        change_pct: i.change_pct,
        sample_size: i.sample_size,
        affected_entity: i.affected_entity,
      }));

      const shared = { category: intent.category, total_found: matches.length, insights: capped };

      return {
        status: "ok",
        empty: matches.length === 0,
        insufficientMessage: `No insights were found in the ${intent.category} category - the engine ran and genuinely found nothing to flag there right now.`,
        facts: shared,
        displayResult: shared,
      };
    }

    case "ai_quality_summary": {
      const res = await injectJson<Envelope<AiQualitySummaryLike>>(app, authorization, "/api/admin/intelligence/ai-quality");
      if (!res.ok) return { status: "unavailable", reason: res.reason };

      const d = res.data.data;
      const shared = {
        reviewed_lines: d.reviewed_lines,
        edited_lines: d.edited_lines,
        overall_correction_rate: d.overall_correction_rate,
        low_confidence_count: d.low_confidence_count,
        by_confidence_bucket: d.by_confidence_bucket,
      };

      return {
        status: "ok",
        empty: d.reviewed_lines === 0,
        insufficientMessage: "Not enough data to answer this: no AI-reviewed request lines are currently recorded.",
        facts: shared,
        displayResult: shared,
      };
    }

    case "operations_summary": {
      const res = await injectJson<Envelope<OperationsSummaryLike>>(app, authorization, "/api/admin/intelligence/operations");
      if (!res.ok) return { status: "unavailable", reason: res.reason };

      const d = res.data.data;
      const shared = { backlog: d.backlog, turnaround: d.turnaround, rejection: d.rejection };
      const empty = d.backlog.total === 0 && d.turnaround.sample_size === 0 && d.rejection.sample_size === 0;

      return {
        status: "ok",
        empty,
        insufficientMessage:
          "Not enough data to answer this: there is currently no backlog, turnaround, or rejection data recorded.",
        facts: shared,
        displayResult: shared,
      };
    }

    case "data_health_summary": {
      const res = await injectJson<Envelope<DataHealthSummaryLike>>(app, authorization, "/api/admin/intelligence/data-health");
      if (!res.ok) return { status: "unavailable", reason: res.reason };

      const d = res.data.data;
      const shared = {
        completeness: d.completeness,
        duplicate_orders: d.duplicate_orders,
        legacy_data_limitations: d.legacy_data_limitations,
      };

      return {
        status: "ok",
        empty: false,
        insufficientMessage: "",
        facts: shared,
        displayResult: shared,
      };
    }
  }
}

// ---------------------------------------------------------------------
// Explanation prompt - reuses the exact "explain only what's in this
// JSON" discipline as Phase 14's insightPrompt/briefingPrompt in
// geminiClient.ts (that file's SAFETY_INSTRUCTIONS is attached
// automatically by callGeminiWithPrompt -> callGemini's own
// systemInstruction, never re-stated or re-worded here).
// ---------------------------------------------------------------------

export function buildAnswerPrompt(question: string, intent: AskIntent, facts: unknown): string {
  return (
    "Task: the user asked the question below. It was classified and answered using the platform's own verified " +
    "analytics data supplied as JSON. Write a short (1-4 sentence) plain-language answer to the user's question, " +
    "using ONLY the facts in the JSON below. Do not add any fact, number, or entity not present here. If the JSON " +
    "shows an empty or near-empty result, say so plainly rather than inventing an answer.\n\n" +
    `User question: ${question}\n\n` +
    `Classified query: ${JSON.stringify(intent)}\n\n` +
    `Verified result JSON:\n${JSON.stringify(facts)}`
  );
}
