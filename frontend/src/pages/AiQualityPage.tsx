import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { PartialDataBanner } from "../components/states/States";
import { ChartContainer } from "../components/charts/ChartContainer";
import { HistogramChart } from "../components/charts/HistogramChart";
import { formatNumber, formatPercent } from "../lib/format";

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
        {(env) => (
          <>
            <PartialDataBanner note={env.meta.completeness_note} />
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
              subtitle="Higher confidence should not be assumed to mean fewer corrections without evidence."
              source={env.meta.source}
              completeness={env.meta.completeness}
              completenessNote={env.meta.completeness_note}
            >
              <HistogramChart
                bars={env.data.by_confidence_bucket.map((b) => ({
                  bucket: b.bucket,
                  count: b.correction_rate === null ? 0 : Math.round(b.correction_rate * 100),
                }))}
              />
              <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                Bars show correction rate (%) per confidence bucket. Sample sizes:{" "}
                {env.data.by_confidence_bucket.map((b) => `${b.bucket}=${b.sample_size}`).join(", ")}.
              </p>
            </ChartContainer>
          </>
        )}
      </QueryBoundary>
    </>
  );
}
