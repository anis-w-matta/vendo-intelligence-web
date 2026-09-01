import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { PartialDataBanner } from "../components/states/States";
import { DataTable, type Column } from "../components/DataTable";
import { ChartContainer } from "../components/charts/ChartContainer";
import { RankingChart } from "../components/charts/RankingChart";
import { formatNumber, formatPercent, formatSeconds } from "../lib/format";
import type { SalesmanRow } from "../lib/types";

const columns: Column<SalesmanRow>[] = [
  { key: "name", header: "Salesman", render: (r) => <Link to={`/salesmen/${r.salesman_id}`}>{r.salesman_name ?? r.salesman_id}</Link> },
  { key: "orders", header: "Orders", align: "right", render: (r) => formatNumber(r.order_count) },
  { key: "lines", header: "Order Lines", align: "right", render: (r) => formatNumber(r.order_line_count) },
  { key: "qty", header: "Item Qty", align: "right", render: (r) => formatNumber(r.item_quantity) },
  { key: "customers", header: "Customers", align: "right", render: (r) => formatNumber(r.customer_count) },
  { key: "opc", header: "Orders/Customer", align: "right", render: (r) => (r.orders_per_customer === null ? "—" : r.orders_per_customer.toFixed(2)) },
  { key: "requests", header: "Requests", align: "right", render: (r) => formatNumber(r.request_count) },
  { key: "rejection", header: "Rejection Rate", align: "right", render: (r) => formatPercent(r.rejection_rate) },
  { key: "turnaround", header: "Median Turnaround", align: "right", render: (r) => formatSeconds(r.median_turnaround_seconds) },
  { key: "ai", header: "AI Correction Rate", align: "right", render: (r) => formatPercent(r.ai_correction_rate) },
];

export function SalesPage() {
  const [filters, setFilters] = useFilters();
  const state = useApiQuery(() => api.salesmen(filters), [JSON.stringify(filters)]);

  return (
    <>
      <PageHeader title="Sales Performance" subtitle="Operational volume by salesman - no revenue or price figures.">
        <GlobalFilters filters={filters} onChange={setFilters} fields={["date"]} />
      </PageHeader>

      <QueryBoundary state={state} onRetry={() => setFilters({ ...filters })}>
        {(env) => (
          <>
            <PartialDataBanner note={env.meta.completeness_note} />
            <div className="chart-grid">
              <ChartContainer title="Item Quantity by Salesman" source={env.meta.source} completeness={env.meta.completeness}>
                <RankingChart
                  rows={[...env.data]
                    .sort((a, b) => Number(b.item_quantity) - Number(a.item_quantity))
                    .slice(0, 15)
                    .map((r) => ({ label: r.salesman_name ?? r.salesman_id, value: Number(r.item_quantity) }))}
                  valueLabel="Item Quantity"
                />
              </ChartContainer>
              <ChartContainer title="Orders by Salesman" source={env.meta.source} completeness={env.meta.completeness}>
                <RankingChart
                  rows={[...env.data]
                    .sort((a, b) => b.order_count - a.order_count)
                    .slice(0, 15)
                    .map((r) => ({ label: r.salesman_name ?? r.salesman_id, value: r.order_count }))}
                  valueLabel="Orders"
                />
              </ChartContainer>
            </div>

            <div className="card">
              <div className="section-title">All Salesmen</div>
              <DataTable columns={columns} rows={env.data} getRowKey={(r) => r.salesman_id} />
            </div>
          </>
        )}
      </QueryBoundary>
    </>
  );
}
