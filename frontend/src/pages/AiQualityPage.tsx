import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { PartialDataBanner } from "../components/states/States";
import { ChartContainer } from "../components/charts/ChartContainer";
import { HistogramChart } from "../components/charts/HistogramChart";
import { TrendLineChart } from "../components/charts/TrendLineChart";
import { DataTable, type Column } from "../components/DataTable";
import { CompletenessBadge } from "../components/CompletenessBadge";
import { formatNumber, formatPercent } from "../lib/format";
import type { AiQualityItemStat, AiQualityIntentStat } from "../lib/types";

// Display-only: the raw bucket labels below `under_60`/`60_80`/`80_90`/
// `90_plus` (see app/services/analytics.py's CONFIDENCE_BUCKETS in the
// Python backend) read awkwardly as chart axis ticks - this only changes
// how the string is shown, never the value or the bucket boundaries.
function humanizeConfidenceBucket(bucket: string): string {
  switch (bucket) {
    case "under_60":
      return "Under 60%";
    case "60_80":
      return "60-80%";
    case "80_90":
      return "80-90%";
    case "90_plus":
      return "90%+";
    default:
      return bucket;
  }
}

// Highest correction rate first (nulls - no reviewed lines - last), so
// the hotspot with the most human corrections observed shows at the top
// of each table. Sample size travels with every row so a reviewer can
// judge how much weight a rate deserves.
function byCorrectionRateDesc<T extends { correction_rate: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.correction_rate === null) return b.correction_rate === null ? 0 : 1;
    if (b.correction_rate === null) return -1;
    return b.correction_rate - a.correction_rate;
  });
}

const itemHotspotColumns: Column<AiQualityItemStat>[] = [
  { key: "item", header: "Item", render: (r) => r.item_nb },
  { key: "rate", header: "Correction Rate", align: "right", render: (r) => formatPercent(r.correction_rate) },
  { key: "sample", header: "Reviewed Lines", align: "right", render: (r) => formatNumber(r.sample_size) },
];

const intentHotspotColumns: Column<AiQualityIntentStat>[] = [
  { key: "intent", header: "Intent", render: (r) => r.intent },
  { key: "rate", header: "Correction Rate", align: "right", render: (r) => formatPercent(r.correction_rate) },
  { key: "sample", header: "Reviewed Lines", align: "right", render: (r) => formatNumber(r.sample_size) },
];

export function AiQualityPage() {
  const [filters, setFilters] = useFilters();
  const state = useApiQuery(() => api.aiQuality(filters), [JSON.stringify(filters)]);

  return (
    <>
      <PageHeader
        title="AI Quality Observatory"
        subtitle="Observed human-correction rates only - never a claimed accuracy figure without ground truth."
      >
        <GlobalFilters filters={filters} onChange={setFilters} fields={["date", "salesman"]} />
      </PageHeader>

      <QueryBoundary state={state} onRetry={() => setFilters({ ...filters })}>
        {(env) => {
          const itemHotspots = byCorrectionRateDesc(env.data.by_item);
          const intentHotspots = byCorrectionRateDesc(env.data.by_intent);
          return (
            <>
              <PartialDataBanner note={env.meta.completeness_note} />

              <div className="banner banner-unavailable" role="status" style={{ marginBottom: 20 }}>
                <span aria-hidden="true">○</span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    <CompletenessBadge status={env.data.correction_taxonomy.status} /> Correction taxonomy and
                    prediction-vs-final comparison
                  </div>
                  <span>{env.data.correction_taxonomy.note}</span>
                </div>
              </div>

              <div className="kpi-grid">
                <div className="card kpi-card">
                  <div className="kpi-name">Reviewed Lines</div>
                  <div className="kpi-value">{formatNumber(env.data.reviewed_lines)}</div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-name">Edited Lines</div>
                  <div className="kpi-value">{formatNumber(env.data.edited_lines)}</div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-name">Overall Correction Rate</div>
                  <div className="kpi-value">{formatPercent(env.data.overall_correction_rate)}</div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-name">Low-Confidence Lines</div>
                  <div className="kpi-value">{formatNumber(env.data.low_confidence_count)}</div>
                </div>
              </div>

              <ChartContainer
                title="Correction Rate by Confidence Bucket"
                subtitle="Observed human-correction rate within each confidence bucket - higher confidence should not be assumed to mean fewer corrections without evidence."
                source={env.meta.source}
                completeness={env.meta.completeness}
                completenessNote={env.meta.completeness_note}
              >
                <HistogramChart
                  bars={env.data.by_confidence_bucket.map((b) => ({
                    bucket: humanizeConfidenceBucket(b.bucket),
                    count: b.correction_rate === null ? 0 : Math.round(b.correction_rate * 100),
                  }))}
                />
                <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                  Bars show observed correction rate (%) per confidence bucket. Sample sizes:{" "}
                  {env.data.by_confidence_bucket
                    .map((b) => `${humanizeConfidenceBucket(b.bucket)}=${b.sample_size}`)
                    .join(", ")}.
                </p>
              </ChartContainer>

              <ChartContainer
                title="Correction Rate Trend"
                subtitle="Monthly observed correction rate, bucketed by when the request entered the queue - not a business/order date."
                source={env.meta.source}
                completeness={env.meta.completeness}
                completenessNote={env.meta.completeness_note}
              >
                <TrendLineChart
                  points={env.data.trend.map((t) => ({
                    bucket: t.bucket,
                    value: t.correction_rate === null ? 0 : Math.round(t.correction_rate * 1000) / 10,
                  }))}
                />
                <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                  Line shows observed correction rate (%) per month. Sample sizes:{" "}
                  {env.data.trend.map((t) => `${t.bucket}=${t.sample_size}`).join(", ") || "none"}.
                </p>
              </ChartContainer>

              <div className="chart-grid">
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="section-title">Correction Rate Hotspots by Item</div>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Items with the highest observed correction rate, highest first. Only items with enough
                    reviewed lines to be meaningful are included server-side - a single edited line on a
                    rarely-ordered item is excluded so it cannot look like a 100% hotspot.
                  </p>
                  <DataTable
                    columns={itemHotspotColumns}
                    rows={itemHotspots}
                    getRowKey={(r) => r.item_nb}
                    emptyBody="No items met the minimum sample size for the current filters."
                  />
                </div>

                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="section-title">Correction Rate Hotspots by Intent</div>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Request intents with the highest observed correction rate, highest first.
                  </p>
                  <DataTable
                    columns={intentHotspotColumns}
                    rows={intentHotspots}
                    getRowKey={(r) => r.intent}
                    emptyBody="No intent data for the current filters."
                  />
                </div>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}
