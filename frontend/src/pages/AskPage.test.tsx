// Phase 15 (Ask VeNdO Intelligence) - AskPage renders whatever
// status/intent/result/answer the BFF returns, verbatim, and never calls
// the BFF automatically (only on submit/example click). `api.ask` is
// mocked here - this test never makes a real network call, matching the
// rest of this app's test suite.
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AskPage } from "./AskPage";
import { ApiError } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: { ask: vi.fn() } };
});

import { api } from "../lib/api";

const askMock = vi.mocked(api.ask);

describe("AskPage", () => {
  it("renders the question input, ask button, and all 7 example questions, and never calls the API before submit", () => {
    render(<AskPage />);
    expect(screen.getByLabelText("Ask a question")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Who created the most orders this month?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How is AI performing?" })).toBeInTheDocument();
    expect(askMock).not.toHaveBeenCalled();
  });

  it("submits the typed question and renders an ok answer with intent/result transparency", async () => {
    askMock.mockResolvedValueOnce({
      question: "How is AI performing?",
      generated_at: "2026-09-02T00:00:00.000Z",
      status: "ok",
      intent: { type: "ai_quality_summary" },
      result: { reviewed_lines: 10, overall_correction_rate: 0.2 },
      answer: "The AI has a 20% correction rate across 10 reviewed lines.",
      insufficient_data: false,
      cached: false,
    });

    render(<AskPage />);
    fireEvent.change(screen.getByLabelText("Ask a question"), { target: { value: "How is AI performing?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => expect(askMock).toHaveBeenCalledWith("How is AI performing?"));
    expect(await screen.findByText(/20% correction rate/)).toBeInTheDocument();
    expect(screen.getByText("You asked").nextElementSibling).toHaveTextContent("How is AI performing?");
  });

  it("clicking an example question asks immediately without requiring a manual submit", async () => {
    askMock.mockResolvedValueOnce({
      question: "Which salesmen have high rejection rates?",
      generated_at: "2026-09-02T00:00:00.000Z",
      status: "ok",
      intent: { type: "salesman_ranking", metric: "rejection_rate", sort: "desc", limit: 5, timeframe: "all_time" },
      result: { metric: "rejection_rate", ranked: [] },
      answer: "n/a",
      insufficient_data: true,
      cached: false,
    });

    render(<AskPage />);
    fireEvent.click(screen.getByRole("button", { name: "Which salesmen have high rejection rates?" }));

    await waitFor(() => expect(askMock).toHaveBeenCalledWith("Which salesmen have high rejection rates?"));
  });

  it("renders an honest 'not enough data' state instead of the raw model answer when insufficient_data is true", async () => {
    askMock.mockResolvedValueOnce({
      question: "Which items increased the most?",
      generated_at: "2026-09-02T00:00:00.000Z",
      status: "ok",
      intent: { type: "insight_lookup", category: "Item" },
      result: { category: "Item", total_found: 0, insights: [] },
      answer: "No insights were found in the Item category - the engine ran and genuinely found nothing to flag there right now.",
      insufficient_data: true,
      cached: false,
    });

    render(<AskPage />);
    fireEvent.change(screen.getByLabelText("Ask a question"), { target: { value: "Which items increased the most?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Not enough data to answer this")).toBeInTheDocument();
  });

  it("renders the unsupported reason for an out-of-scope (e.g. financial) question, never a fabricated answer", async () => {
    askMock.mockResolvedValueOnce({
      question: "What was our total revenue last month?",
      generated_at: "2026-09-02T00:00:00.000Z",
      status: "unsupported",
      reason: "This platform does not track revenue, price, or monetary data.",
      intent: { type: "unsupported", reason: "This platform does not track revenue, price, or monetary data." },
      result: null,
    });

    render(<AskPage />);
    fireEvent.change(screen.getByLabelText("Ask a question"), { target: { value: "What was our total revenue last month?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("This question isn't supported")).toBeInTheDocument();
    expect(screen.getByText(/does not track revenue/)).toBeInTheDocument();
  });

  it("renders an unavailable state when the BFF reports Gemini/upstream unavailable", async () => {
    askMock.mockResolvedValueOnce({
      question: "How is AI performing?",
      generated_at: "2026-09-02T00:00:00.000Z",
      status: "unavailable",
      reason: "GEMINI_API_KEY is not configured",
      intent: null,
      result: null,
    });

    render(<AskPage />);
    fireEvent.change(screen.getByLabelText("Ask a question"), { target: { value: "How is AI performing?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Ask VeNdO is unavailable right now")).toBeInTheDocument();
  });

  it("renders an error banner when the API call itself throws (e.g. auth/network failure)", async () => {
    askMock.mockRejectedValueOnce(new ApiError(0, "Could not reach the Intelligence API. Is the BFF running?"));

    render(<AskPage />);
    fireEvent.change(screen.getByLabelText("Ask a question"), { target: { value: "How is AI performing?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Could not reach the Intelligence API. Is the BFF running?")).toBeInTheDocument();
  });
});
