import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { PartialDataBanner } from "../components/states/States";
import { ChartContainer } from "../components/charts/ChartContainer";
import { HistogramChart } from "../components/charts/HistogramChart";
import { DataTable, type Column } from "../components/DataTable";
import { formatNumber, formatPercent, formatSeconds } from "../lib/format";

interface RejectionRow { salesman_id: string; rejection_rate: number | null; request_count: number }

const rejectionColumns: Column<RejectionRow>[] = [
  { key: "salesman", header: "Salesman", render: (r) => r.salesman_id },
  { key: "requests", header: "Requests", align: "right", render: (r) => formatNumber(r.request_count) },
  { key: "rate", header: "Rejection Rate", align: "right", render: (r) => formatPercent(r.rejection_rate) },
];

export function OperationsPage() {
  const [filters, setFilters] = useFilters();
  const state = useApiQuery(() => api.operations(filters), [JSON.stringify(filters)]);

  return (
    <>
      <PageHeader title="Operations Command Center" subtitle="Backlog, turnaround, and rejection - no SLA is defined anywhere in this project, so none is shown.">
        <GlobalFilters filters={filters} onChange={setFilters} fields={["date", "salesman"]} />
      </PageHeader>

      <QueryBoundary state={state} onRetry={() => setFilters({ ...filters })}>
        {(env) => (
          <>
            <PartialDataBanner note={env.meta.completeness_note} />
            <div className="kpi-grid">
              <div className="card kpi-card">
                <div className="kpi-name">Backlog</div>
                <div className="kpi-value">{formatNumber(env.data.backlog.total)}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-name">Median Turnaround</div>
                <div className="kpi-value">{formatSeconds(env.data.turnaround.median_seconds)}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-name">P90 Turnaround</div>
                <div className="kpi-value">{formatSeconds(env.data.turnaround.p90_seconds)}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-name">Rejection Rate</div>
                <div className="kpi-value">{formatPercent(env.data.rejection.rejection_rate)}</div>
              </div>
            </div>

            <div className="chart-grid">
              <ChartContainer title="Backlog Age" source={env.meta.source} completeness={env.meta.completeness}>
                <HistogramChart bars={Object.entries(env.data.backlog.age_buckets).map(([bucket, count]) => ({ bucket, count }))} />
              </ChartContainer>
              <div className="card">
                <div className="section-title">Rejection by Salesman</div>
                <DataTable columns={rejectionColumns} rows={env.data.rejection_by_salesman} getRowKey={(r) => r.salesman_id} />
              </div>
            </div>
          </>
        )}
      </QueryBoundary>
    </>
  );
}
