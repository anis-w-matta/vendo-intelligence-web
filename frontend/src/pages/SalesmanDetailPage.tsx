import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { KpiCard } from "../components/KpiCard";
import { DataTable, type Column } from "../components/DataTable";
import { formatNumber } from "../lib/format";
import type { EnvelopeMeta, Metric, TopCustomerRow } from "../lib/types";

function statMetric<T>(name: string, value: T, unit: string, meta: EnvelopeMeta): Metric<T> {
  return {
    name, value, unit, period: meta.period, filters: meta.filters,
    source: meta.source, formula: meta.formula ?? "", completeness: meta.completeness,
    completeness_note: meta.completeness_note, last_updated: meta.last_updated,
  };
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
          return (
            <>
              <div className="kpi-grid">
                <KpiCard metric={statMetric("Orders", d.order_count, "orders", env.meta)} />
                <KpiCard metric={statMetric("Order Lines", d.order_line_count, "lines", env.meta)} />
                <KpiCard metric={statMetric("Item Quantity", d.item_quantity, "units", env.meta)} />
                <KpiCard metric={statMetric("Customers", d.customer_count, "customers", env.meta)} />
                <KpiCard metric={statMetric("Requests", d.request_count, "requests", env.meta)} />
                <KpiCard metric={statMetric("Rejection Rate", d.rejection_rate === null ? null : Math.round(d.rejection_rate * 1000) / 10, "%", env.meta)} />
                <KpiCard metric={statMetric("Median Turnaround", d.median_turnaround_seconds, "seconds", env.meta)} />
                <KpiCard metric={statMetric("AI Correction Rate", d.ai_correction_rate === null ? null : Math.round(d.ai_correction_rate * 1000) / 10, "%", env.meta)} />
              </div>

              <div className="card">
                <div className="section-title">Top Customers</div>
                <DataTable columns={customerColumns} rows={d.top_customers} getRowKey={(r) => r.cust_nb} />
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}
