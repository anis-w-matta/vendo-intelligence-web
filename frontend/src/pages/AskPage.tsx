import { useState, type CSSProperties, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { PageHeader } from "../components/layout/PageHeader";
import { LoadingBlock, UnavailableBlock, EmptyState, ErrorBanner } from "../components/states/States";
import type { AskResponse } from "../lib/types";

const CODE_BLOCK_STYLE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: 11,
  background: "rgba(127,127,127,0.08)",
  padding: 10,
  borderRadius: 6,
  overflowX: "auto",
  marginTop: 6,
  maxHeight: 320,
};

// Phase 15 (Ask VeNdO Intelligence): a free-text question -> Gemini
// classification -> a validated, closed-world intent -> execution against
// an already-verified data source -> a Gemini explanation of ONLY that
// verified result (see backend/src/routes/ask.ts / backend/src/lib/
// askEngine.ts). This page never computes anything itself - it renders
// whatever status/intent/result/answer the BFF returns, verbatim, exactly
// like every other page in this app renders server-computed facts.
//
// The example questions below are this phase's own worked examples -
// offered as one-click prompts, not a hint that only these seven work.
const EXAMPLE_QUESTIONS = [
  "Who created the most orders this month?",
  "Which salesman has the most item quantity?",
  "Which customers show declining activity?",
  "Why is backlog higher?",
  "Which items increased the most?",
  "Which salesmen have high rejection rates?",
  "How is AI performing?",
];

type AskState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "done"; response: AskResponse };

function IntentSummary({ intent }: { intent: AskResponse["intent"] }) {
  if (!intent) return null;
  return (
    <details style={{ marginTop: 12 }}>
      <summary className="muted" style={{ fontSize: 11.5, cursor: "pointer" }}>
        Classified query (for transparency)
      </summary>
      <pre style={CODE_BLOCK_STYLE}>{JSON.stringify(intent, null, 2)}</pre>
    </details>
  );
}

function ResultSummary({ result }: { result: unknown }) {
  if (result === null || result === undefined) return null;
  return (
    <details style={{ marginTop: 6 }} open>
      <summary className="muted" style={{ fontSize: 11.5, cursor: "pointer" }}>
        Underlying verified data
      </summary>
      <pre style={CODE_BLOCK_STYLE}>{JSON.stringify(result, null, 2)}</pre>
    </details>
  );
}

export function AskPage() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>({ status: "idle" });

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setState({ status: "loading" });
    try {
      const response = await api.ask(trimmed);
      setState({ status: "done", response });
    } catch (err) {
      setState({ status: "error", error: err instanceof ApiError ? err : new ApiError(0, "Unexpected error.") });
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ask(question);
  }

  function askExample(q: string) {
    setQuestion(q);
    void ask(q);
  }

  return (
    <>
      <PageHeader
        title="Ask VeNdO"
        subtitle="Ask a question about sales, customers, items, operations, AI quality, or data health. This platform has no price, revenue, or order-value data - questions about those are declined, never guessed."
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Who created the most orders this month?"
            aria-label="Ask a question"
            style={{ flex: "1 1 320px", padding: "8px 10px", fontSize: 13 }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={state.status === "loading" || question.trim().length === 0}
          >
            {state.status === "loading" ? "Asking…" : "Ask"}
          </button>
        </form>
        <div style={{ marginTop: 10 }}>
          <span className="muted" style={{ fontSize: 11.5 }}>Try: </span>
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              className="btn btn-ghost"
              style={{ padding: "2px 8px", fontSize: 11, marginRight: 6, marginTop: 4 }}
              disabled={state.status === "loading"}
              onClick={() => askExample(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {state.status === "loading" && <LoadingBlock rows={2} />}
      {state.status === "error" && <ErrorBanner error={state.error} onRetry={() => setState({ status: "idle" })} />}

      {state.status === "done" && (
        <div className="card">
          <div className="muted" style={{ fontSize: 11.5 }}>You asked</div>
          <p style={{ fontWeight: 600, margin: "2px 0 14px" }}>{state.response.question}</p>

          {state.response.status === "unavailable" && (
            <UnavailableBlock title="Ask VeNdO is unavailable right now" note={state.response.reason} />
          )}

          {state.response.status === "unsupported" && (
            <EmptyState title="This question isn't supported" body={state.response.reason} />
          )}

          {state.response.status === "ok" && (
            <>
              {state.response.insufficient_data ? (
                <EmptyState title="Not enough data to answer this" body={state.response.answer} />
              ) : (
                <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>{state.response.answer}</p>
              )}
              <IntentSummary intent={state.response.intent} />
              <ResultSummary result={state.response.result} />
            </>
          )}
        </div>
      )}
    </>
  );
}
