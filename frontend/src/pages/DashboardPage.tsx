import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { KpiCard } from "../components/KpiCard";
import { ChartContainer } from "../components/charts/ChartContainer";
import { RankingChart } from "../components/charts/RankingChart";
import { TrendLineChart } from "../components/charts/TrendLineChart";
import { UnavailableBlock } from "../components/states/States";
import { formatNumber } from "../lib/format";

export function DashboardPage() {
  const [filters, setFilters] = useFilters();
  const state = useApiQuery(() => api.overview(filters), [JSON.stringify(filters)]);

  return (
    <>
      <PageHeader title="Command Center" subtitle="What is happening across VeNdO right now.">
        <GlobalFilters filters={filters} onChange={setFilters} fields={["date", "salesman"]} />
      </PageHeader>

      <QueryBoundary state={state} onRetry={() => setFilters({ ...filters })}>
        {(data) => (
          <>
            <div className="kpi-grid">
              {Object.values(data.kpis).map((m) => (
                <KpiCard key={m.name} metric={m} />
              ))}
            </div>

            <div className="chart-grid">
              <ChartContainer
                title="Orders by Salesman"
                subtitle="Current customer-portfolio attribution"
                source={data.sales_by_salesman.meta.source}
                completeness={data.sales_by_salesman.meta.completeness}
                completenessNote={data.sales_by_salesman.meta.completeness_note}
              >
                <RankingChart
                  rows={data.sales_by_salesman.data.map((r) => ({
                    label: r.salesman_name ?? r.salesman_id,
                    value: r.order_count,
                  }))}
                  valueLabel="Orders"
                />
              </ChartContainer>

              <ChartContainer
                title="Request Volume Over Time"
                source={data.request_volume_over_time.meta.source}
                completeness={data.request_volume_over_time.meta.completeness}
              >
                <TrendLineChart
                  points={data.request_volume_over_time.data.map((p) => ({ bucket: p.bucket, value: p.count }))}
                />
              </ChartContainer>
            </div>

            <div className="chart-grid">
              <div className="card">
                <div className="section-title">Customer Portfolio</div>
                <p className="muted" style={{ marginTop: -4 }}>
                  {formatNumber(data.customers.data.assigned)} assigned · {formatNumber(data.customers.data.unassigned)} unassigned
                  {" "}of {formatNumber(data.customers.data.total)} total customers.
                </p>
                <Link to="/customers" className="btn btn-ghost">View customers →</Link>
              </div>

              <div className="card">
                <div className="section-title">Needs Attention</div>
                <UnavailableBlock note={data.attention.note} />
              </div>
            </div>
          </>
        )}
      </QueryBoundary>
    </>
  );
}
