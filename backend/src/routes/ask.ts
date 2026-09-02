// Phase 15 (Ask VeNdO Intelligence): POST /api/admin/intelligence/ask.
//
// Pipeline: question -> Gemini classification -> validated AskIntent
// (backend/src/lib/askEngine.ts's parseAskIntent - Gemini's classification
// output is NEVER trusted directly) -> execution against the one existing,
// already-verified route that intent maps to (askEngine.ts's
// executeAskIntent, via app.inject() - same in-process pattern
// geminiExplain.ts's briefing endpoint already uses) -> Gemini explanation
// of ONLY that verified, bounded result (geminiClient.ts's
// callGeminiWithPrompt - the same call/cache/safety-instruction machinery
// Phase 14's explain-insight/briefing calls use, not a second wrapper).
//
// Always responds 200 with a typed `status: "ok" | "unsupported" |
// "unavailable"` body when the request itself was well-formed - a Gemini
// outage, an out-of-scope question (financial or otherwise), or an
// upstream analytics failure are all honest, expected states here, never
// a 5xx. See askEngine.ts's own module docstring for the full "never
// trust the classification, never execute an unvalidated intent"
// reasoning.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../plugins/auth.js";
import { callGeminiWithPrompt } from "../lib/geminiClient.js";
import {
  buildAnswerPrompt,
  buildClassificationPrompt,
  executeAskIntent,
  parseAskIntent,
  parseGeminiJson,
  type AskIntent,
} from "../lib/askEngine.js";

const AskBody = z.object({ question: z.string().min(3).max(500) }).strict();

// Classification is content-addressed by the exact question text - a
// re-asked identical question within the TTL is free. Kept shorter than
// Phase 14's 12h insight-explanation TTL since Ask VeNdO's underlying data
// (salesman rankings, insights, AI/ops/data-health summaries) can change
// within a work day and a stale classification is cheap to recompute
// (classification alone is a tiny prompt/response).
const CLASSIFY_TTL_MS = 30 * 60 * 1000;
// The answer is keyed by the exact (intent, facts) pair, so a genuinely
// different verified result always gets a fresh answer regardless of TTL
// - this TTL only governs how long an IDENTICAL question+result pair's
// answer is reused.
const ANSWER_TTL_MS = 30 * 60 * 1000;

interface AskResponseBase {
  question: string;
  generated_at: string;
}

export default async function askRoutes(app: FastifyInstance) {
  app.post("/api/admin/intelligence/ask", { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = AskBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid request body", detail: parsed.error.flatten() });
    }

    const question = parsed.data.question.trim();
    const authorization = request.headers.authorization!;
    const now = new Date();
    const base: AskResponseBase = { question, generated_at: now.toISOString() };

    // 1. Classify. Gemini gets ONLY the question text + today's date - no
    // access to any real data at this stage.
    const classifyKey = `ask-classify:${question.toLowerCase()}`;
    const classifyResult = await callGeminiWithPrompt(
      classifyKey,
      CLASSIFY_TTL_MS,
      buildClassificationPrompt(question, base.generated_at),
    );

    if (classifyResult.status === "unavailable") {
      return reply.send({ ...base, status: "unavailable", reason: classifyResult.reason, intent: null, result: null });
    }

    // 2. Validate. Gemini's raw text is never trusted - parseGeminiJson
    // may return `undefined` for unparseable text, and parseAskIntent
    // always resolves anything that doesn't cleanly match the closed
    // schema (including financial/out-of-enum questions Gemini itself
    // classified as unsupported, or failed to classify at all) to
    // `{ type: "unsupported" }`.
    const intent: AskIntent = parseAskIntent(parseGeminiJson(classifyResult.text));

    if (intent.type === "unsupported") {
      return reply.send({ ...base, status: "unsupported", reason: intent.reason, intent, result: null });
    }

    // 3. Execute the validated intent against its one mapped, already-
    // verified data source.
    const execution = await executeAskIntent(app, authorization, intent, now);
    if (execution.status === "unavailable") {
      return reply.send({ ...base, status: "unavailable", reason: execution.reason, intent, result: null });
    }

    // 4. An empty/insufficient result never goes to Gemini for
    // "explanation" - there is nothing to explain, and papering over an
    // empty result with model-generated prose is exactly what this
    // phase's "never guess" rule forbids. The honest message is
    // deterministic, not model-generated.
    if (execution.empty) {
      return reply.send({
        ...base,
        status: "ok",
        intent,
        result: execution.displayResult,
        answer: execution.insufficientMessage,
        insufficient_data: true,
        cached: false,
      });
    }

    // 5. Explain the verified, bounded result - same safety discipline as
    // Phase 14's explainInsight/generateBriefing (geminiClient.ts's
    // SAFETY_INSTRUCTIONS, attached automatically by callGeminiWithPrompt).
    const answerKey = `ask-answer:${JSON.stringify({ intent, facts: execution.facts })}`;
    const answerResult = await callGeminiWithPrompt(
      answerKey,
      ANSWER_TTL_MS,
      buildAnswerPrompt(question, intent, execution.facts),
    );

    if (answerResult.status === "unavailable") {
      return reply.send({
        ...base,
        status: "unavailable",
        reason: answerResult.reason,
        intent,
        result: execution.displayResult,
      });
    }

    return reply.send({
      ...base,
      status: "ok",
      intent,
      result: execution.displayResult,
      answer: answerResult.text,
      insufficient_data: false,
      cached: answerResult.cached,
    });
  });
}
