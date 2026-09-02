import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { KpiCard } from "../components/KpiCard";
import { DataTable, type Column } from "../components/DataTable";
import { ChartContainer } from "../components/charts/ChartContainer";
import { TrendLineChart } from "../components/charts/TrendLineChart";
import { computeInvestigationFlags } from "../lib/benchmarking";
import { formatNumber, formatPercent, formatSeconds } from "../lib/format";
import type { EnvelopeMeta, Metric, TopCustomerRow } from "../lib/types";

function statMetric<T>(name: string, value: T, unit: string, meta: EnvelopeMeta): Metric<T> {
  return {
    name, value, unit, period: meta.period, filters: meta.filters,
    source: meta.source, formula: meta.formula ?? "", completeness: meta.completeness,
    completeness_note: meta.completeness_note, last_updated: meta.last_updated,
  };
}

// Formatted "value · Fleet avg: value" comparison line for #4 - always
// renders the BFF's own fleet_average verbatim, never a client-derived
// average.
function BenchmarkRow({ label, format, value, avg }: {
  label: string;
  format: (v: number | null) => string;
  value: number | null;
  avg: number | null;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
      <span>{label}</span>
      <span>
        {format(value)} <span className="muted">· Fleet avg: {format(avg)}</span>
      </span>
    </div>
  );
}

const customerColumns: Column<TopCustomerRow>[] = [
  { key: "name", header: "Customer", render: (r) => <Link to={`/customers/${r.cust_nb}`}>{r.customer_name}</Link> },
  { key: "orders", header: "Orders", align: "right", render: (r) => formatNumber(r.order_count) },
  { key: "qty", header: "Item Qty", align: "right", render: (r) => formatNumber(r.item_quantity) },
];

export function SalesmanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [filters, setFilters] = useFilters();
  const state = useApiQuery(() => api.salesmanDetail(id!, filters), [id, JSON.stringify(filters)]);

  return (
    <>
      <div className="breadcrumb"><Link to="/sales">← Sales Performance</Link></div>
      <PageHeader title={id ?? ""} subtitle="Salesman 360 - current customer-portfolio attribution.">
        <GlobalFilters filters={filters} onChange={setFilters} fields={["date"]} />
      </PageHeader>

      <QueryBoundary state={state} onRetry={() => setFilters({ ...filters })}>
        {(env) => {
          const d = env.data;
          const flags = computeInvestigationFlags({
            order_count: d.order_count,
            customer_count: d.customer_count,
            rejection_rate: d.rejection_rate,
            median_turnaround_seconds: d.median_turnaround_seconds,
            fleet_average: d.fleet_average,
          });

          const orderTrendPoints = d.orders_trend.map((p) => ({ bucket: p.bucket, value: p.order_count }));
          const itemQtyTrendPoints = d.orders_trend.map((p) => ({ bucket: p.bucket, value: Number(p.item_quantity) }));
          const requestVolumeTrendPoints = d.request_volume_trend.map((p) => ({ bucket: p.bucket, value: p.count }));

          return (
            <>
              {/* ---- Performance: at-a-glance KPIs + fleet benchmarking + investigation signals ---- */}
              <div className="section-title">Performance</div>
              <div className="kpi-grid">
                <KpiCard metric={statMetric("Orders", d.order_count, "orders", env.meta)} />
                <KpiCard metric={statMetric("Current Customers", d.current_customer_count, "customers", env.meta)} />
                <KpiCard metric={statMetric("Rejection Rate", d.rejection_rate === null ? null : Math.round(d.rejection_rate * 1000) / 10, "%", env.meta)} />
                <KpiCard metric={statMetric("Median Turnaround", d.median_turnaround_seconds, "seconds", env.meta)} />
              </div>

              <div className="two-col" style={{ marginBottom: 20 }}>
                <div className="card">
                  <div className="section-title">Fleet Benchmark</div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                    Investigation signal only - compares this salesman against the mean/median across{" "}
                    {d.fleet_average.sample_size} active salesman(s) today. Not a performance verdict.
                  </div>
                  <BenchmarkRow label="Orders" format={formatNumber} value={d.order_count} avg={d.fleet_average.order_count} />
                  <BenchmarkRow label="Item Quantity" format={formatNumber} value={Number(d.item_quantity)} avg={d.fleet_average.item_quantity} />
                  <BenchmarkRow label="Customers" format={formatNumber} value={d.customer_count} avg={d.fleet_average.customer_count} />
                  <BenchmarkRow label="Rejection Rate" format={formatPercent} value={d.rejection_rate} avg={d.fleet_average.rejection_rate} />
                  <BenchmarkRow label="Median Turnaround" format={formatSeconds} value={d.median_turnaround_seconds} avg={d.fleet_average.median_turnaround_seconds} />
                </div>

                <div className="card">
                  <div className="section-title">Investigation Signals</div>
                  {flags.length === 0 ? (
                    <div className="muted" style={{ fontSize: 13 }}>No thresholds crossed against the fleet benchmark above.</div>
                  ) : (
                    <div className="stack">
                      {flags.map((f) => (
                        <div key={f.id} className="banner banner-partial" role="status" style={{ marginBottom: 0 }}>
                          <span aria-hidden="true">◐</span>
                          <span>{f.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ---- Customers ---- */}
              <div className="section-title">Customers</div>
              <div className="kpi-grid">
                <KpiCard metric={statMetric("Current Customers", d.current_customer_count, "customers", env.meta)} />
                <KpiCard metric={statMetric("Customers (order-attributed)", d.customer_count, "customers", env.meta)} />
                <KpiCard metric={statMetric("Orders/Customer", d.orders_per_customer === null ? null : Math.round(d.orders_per_customer * 100) / 100, "orders/customer", env.meta)} />
                <KpiCard metric={statMetric("Items/Customer", d.items_per_customer === null ? null : Math.round(d.items_per_customer * 100) / 100, "units/customer", env.meta)} />
              </div>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="section-title">Top Customers</div>
                <DataTable columns={customerColumns} rows={d.top_customers} getRowKey={(r) => r.cust_nb} />
              </div>

              {/* ---- Orders ---- */}
              <div className="section-title">Orders</div>
              <div className="kpi-grid">
                <KpiCard metric={statMetric("Orders", d.order_count, "orders", env.meta)} />
              </div>
              <div className="chart-grid">
                <ChartContainer title="Order Trend" source={env.meta.source} completeness={env.meta.completeness}>
                  <TrendLineChart points={orderTrendPoints} />
                </ChartContainer>
              </div>

              {/* ---- Items ---- */}
              <div className="section-title">Items</div>
              <div className="kpi-grid">
                <KpiCard metric={statMetric("Item Quantity", d.item_quantity, "units", env.meta)} />
                <KpiCard metric={statMetric("Items/Order", d.items_per_order === null ? null : Math.round(d.items_per_order * 100) / 100, "units/order", env.meta)} />
                <KpiCard metric={statMetric("Items/Customer", d.items_per_customer === null ? null : Math.round(d.items_per_customer * 100) / 100, "units/customer", env.meta)} />
              </div>
              <div className="chart-grid">
                <ChartContainer title="Item Quantity Trend" source={env.meta.source} completeness={env.meta.completeness}>
                  <TrendLineChart points={itemQtyTrendPoints} />
                </ChartContainer>
              </div>

              {/* ---- Operations ---- */}
              <div className="section-title">Operations</div>
              <div className="kpi-grid">
                <KpiCard metric={statMetric("Rejection Rate", d.rejection_rate === null ? null : Math.round(d.rejection_rate * 1000) / 10, "%", env.meta)} />
                <KpiCard metric={statMetric("Median Turnaround", d.median_turnaround_seconds, "seconds", env.meta)} />
              </div>

              {/* ---- AI Quality ---- */}
              <div className="section-title">AI Quality</div>
              <div className="kpi-grid">
                <KpiCard metric={statMetric("AI Correction Rate", d.ai_correction_rate === null ? null : Math.round(d.ai_correction_rate * 1000) / 10, "%", env.meta)} />
              </div>

              {/* ---- Activity ---- */}
              <div className="section-title">Activity</div>
              <div className="kpi-grid">
                <KpiCard metric={statMetric("Requests", d.request_count, "requests", env.meta)} />
              </div>
              <div className="chart-grid">
                <ChartContainer title="Request Volume Trend" source={env.meta.source} completeness={env.meta.completeness}>
                  <TrendLineChart points={requestVolumeTrendPoints} />
                </ChartContainer>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}
