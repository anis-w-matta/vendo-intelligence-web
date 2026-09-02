import { clearSession, loadSession } from "./auth";
import { filtersToSearchParams } from "./filters";
import type { Filters } from "./types";

const BFF_URL = import.meta.env.VITE_BFF_URL ?? "http://127.0.0.1:8200";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Thrown by useApiQuery's caller (App-level redirect to /login) rather than
// handled per-page - every page treats "not authenticated" the same way.
export class UnauthorizedError extends ApiError {}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    clearSession();
    throw new UnauthorizedError(401, "Your session expired. Please sign in again.");
  }
  if (res.status === 403) {
    throw new ApiError(403, "Admin access required.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error ?? body.detail ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail || `Request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

async function request<T>(path: string, params?: Filters): Promise<T> {
  const session = loadSession();
  if (!session) throw new UnauthorizedError(401, "Not signed in.");

  const qs = params ? filtersToSearchParams(params).toString() : "";
  const url = `${BFF_URL}${path}${qs ? `?${qs}` : ""}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` } });
  } catch {
    throw new ApiError(0, "Could not reach the Intelligence API. Is the BFF running?");
  }
  return handleResponse<T>(res);
}

// Phase 14: the only POST call this app makes - "Explain this insight"
// sends the one clicked Insight's own fields to the BFF (never triggered
// automatically, see InsightsPage.tsx).
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const session = loadSession();
  if (!session) throw new UnauthorizedError(401, "Not signed in.");

  const url = `${BFF_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Could not reach the Intelligence API. Is the BFF running?");
  }
  return handleResponse<T>(res);
}

export const api = {
  overview: (f: Filters) => request<import("./types").OverviewData>("/api/admin/intelligence/overview", f),
  salesmen: (f: Filters) => request<import("./types").Envelope<import("./types").SalesmanRow[]>>("/api/admin/intelligence/salesmen", f),
  salesmanDetail: (id: string, f: Filters) =>
    request<import("./types").Envelope<import("./types").SalesmanDetail>>(
      `/api/admin/intelligence/salesmen/${encodeURIComponent(id)}`, f,
    ),
  customers: (f: Filters) => request<import("./types").Envelope<import("./types").CustomersPageData>>("/api/admin/intelligence/customers", f),
  customerDetail: (id: string, f: Filters) =>
    request<import("./types").Envelope<import("./types").CustomerDetailData>>(
      `/api/admin/intelligence/customers/${encodeURIComponent(id)}`, f,
    ),
  items: (f: Filters) => request<import("./types").Envelope<import("./types").ItemsPageData>>("/api/admin/intelligence/items", f),
  itemDetail: (id: string) =>
    request<import("./types").Envelope<import("./types").ItemDetailData>>(`/api/admin/intelligence/items/${encodeURIComponent(id)}`),
  categories: (f: Filters) => request<import("./types").Envelope<import("./types").CategoryRow[]>>("/api/admin/intelligence/categories", f),
  operations: (f: Filters) => request<import("./types").Envelope<import("./types").OperationsPageData>>("/api/admin/intelligence/operations", f),
  aiQuality: (f: Filters) => request<import("./types").Envelope<import("./types").AiQualityData>>("/api/admin/intelligence/ai-quality", f),
  dataHealth: () => request<import("./types").Envelope<import("./types").DataHealthData>>("/api/admin/intelligence/data-health"),
  insights: (f: Filters) => request<import("./types").InsightsData>("/api/admin/intelligence/insights", f),
  orders: (f: Filters) => request<import("./types").Envelope<import("./types").OrdersPageData>>("/api/admin/intelligence/orders", f),
  requests: (f: Filters) => request<import("./types").Envelope<import("./types").RequestsPageData>>("/api/admin/intelligence/requests", f),
  // Phase 14 (Gemini Intelligence Layer) - never called automatically;
  // only on an explicit user action (an "Explain" click, or the Command
  // Center loading its briefing card once).
  explainInsight: (insight: import("./types").Insight) =>
    postJson<import("./types").GeminiExplainResult>("/api/admin/intelligence/insights/explain", insight),
  briefing: () => request<import("./types").GeminiBriefingResult>("/api/admin/intelligence/briefing"),
};
