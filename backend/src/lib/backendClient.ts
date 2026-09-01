// Typed calls into `backend` (PendingRequest/PendingLine/Salesman/
// ActivityLog) - see vendo-app/backend. Field names match the Python
// Pydantic Out schemas verbatim (snake_case, no translation) so a diff
// between the two is easy to spot.
import { config } from "../config.js";
import { getJson } from "./httpClient.js";

const client = { service: "backend", baseUrl: config.backendUrl, apiKey: config.backendApiKey };

export interface AuthMeOut {
  login_id: string;
  name: string;
  email: string | null;
  role: string;
  is_active: boolean;
}

export function getAuthMe(authorization: string): Promise<AuthMeOut> {
  return getJson<AuthMeOut>({ ...client, authorization }, "/auth/me");
}

export interface SalesmanOut {
  login_id: string;
  name: string;
  email: string | null;
  role: string;
  is_active: boolean;
}

export function listSalesmen(authorization: string, includeInactive = false): Promise<SalesmanOut[]> {
  return getJson<SalesmanOut[]>({ ...client, authorization }, "/salesmen", {
    include_inactive: includeInactive,
  });
}

export interface RequestsFilterParams {
  date_from?: string;
  date_to?: string;
  salesman_id?: string;
  cust_nb?: string;
  status?: string;
  intent?: string;
}

export interface StatusCountOut {
  status: string;
  count: number;
}

export interface BacklogSummaryOut {
  total: number;
  oldest_created_at: string | null;
  age_buckets: Record<string, number>;
}

export interface TurnaroundSummaryOut {
  sample_size: number;
  median_seconds: number | null;
  avg_seconds: number | null;
  p75_seconds: number | null;
  p90_seconds: number | null;
  p95_seconds: number | null;
}

export interface RejectionSummaryOut {
  sample_size: number;
  rejection_rate: number | null;
  previous_period_rejection_rate: number | null;
}

export interface VolumePointOut {
  day: string;
  status: string;
  count: number;
}

export interface RequestsSummaryOut {
  status_counts: StatusCountOut[];
  backlog: BacklogSummaryOut;
  turnaround: TurnaroundSummaryOut;
  rejection: RejectionSummaryOut;
  volume_over_time: VolumePointOut[];
}

export function getRequestsSummary(
  authorization: string,
  params: RequestsFilterParams,
): Promise<RequestsSummaryOut> {
  return getJson<RequestsSummaryOut>(
    { ...client, authorization },
    "/admin/analytics/requests-summary",
    params,
  );
}

export interface ConfidenceBucketStatOut {
  bucket: string;
  sample_size: number;
  correction_rate: number | null;
}

export interface AiQualitySummaryOut {
  reviewed_lines: number;
  edited_lines: number;
  overall_correction_rate: number | null;
  low_confidence_count: number;
  by_confidence_bucket: ConfidenceBucketStatOut[];
}

export function getAiQualitySummary(
  authorization: string,
  params: RequestsFilterParams,
): Promise<AiQualitySummaryOut> {
  return getJson<AiQualitySummaryOut>(
    { ...client, authorization },
    "/admin/analytics/ai-quality-summary",
    params,
  );
}

export interface SalesmanRequestMetricsOut {
  salesman_id: string;
  request_count: number;
  rejection_rate: number | null;
  median_turnaround_seconds: number | null;
  ai_correction_rate: number | null;
}

export function getSalesmenRequestMetrics(
  authorization: string,
  params: Omit<RequestsFilterParams, "salesman_id">,
): Promise<SalesmanRequestMetricsOut[]> {
  return getJson<SalesmanRequestMetricsOut[]>(
    { ...client, authorization },
    "/admin/analytics/salesmen-request-metrics",
    params,
  );
}
