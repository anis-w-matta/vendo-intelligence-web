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
import { ScatterChart } from "../components/charts/ScatterChart";
import { classifyQuadrants, QUADRANT_LABELS } from "../lib/benchmarking";
import { formatNumber, formatPercent, formatSeconds } from "../lib/format";
import type { SalesmanRow } from "../lib/types";

const columns: Column<SalesmanRow>[] = [
  { key: "name", header: "Salesman", render: (r) => <Link to={`/salesmen/${r.salesman_id}`}>{r.salesman_name ?? r.salesman_id}</Link> },
  { key: "orders", header: "Orders", align: "right", render: (r) => formatNumber(r.order_count) },
  { key: "lines", header: "Order Lines", align: "right", render: (r) => formatNumber(r.order_line_count) },
  { key: "qty", header: "Item Qty", align: "right", render: (r) => formatNumber(r.item_quantity) },
  { key: "customers", header: "Customers", align: "right", render: (r) => formatNumber(r.customer_count) },
  { key: "opc", header: "Orders/Customer", align: "right", render: (r) => (r.orders_per_customer === null ? "—" : r.orders_per_customer.toFixed(2)) },
  { key: "ipc", header: "Items/Customer", align: "right", render: (r) => (r.items_per_customer === null ? "—" : r.items_per_customer.toFixed(2)) },
  { key: "ipo", header: "Items/Order", align: "right", render: (r) => (r.items_per_order === null ? "—" : r.items_per_order.toFixed(2)) },
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
        {(env) => {
          // Workload vs. output (#5/#6): x = customer portfolio size
          // (customer_count), y = order activity (order_count) - picking
          // order_count over item_quantity as y since it's a whole-number
          // Order count, matching the "Orders" ranking chart above, rather
          // than a Decimal-string item quantity.
          const quadrants = classifyQuadrants(
            env.data.map((r) => ({ salesman_id: r.salesman_id, x: r.customer_count, y: r.order_count })),
          );
          const scatterPoints = quadrants.points.map((p) => {
            const row = env.data.find((r) => r.salesman_id === p.salesman_id);
            return { id: p.salesman_id, label: row?.salesman_name ?? p.salesman_id, x: p.x, y: p.y, quadrant: p.quadrant };
          });

          return (
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

              <ChartContainer
                title="Workload vs. Output"
                subtitle="Each point is a salesman - customer portfolio size (x) vs. order activity (y)."
                source={env.meta.source}
                completeness={env.meta.completeness}
              >
                <ScatterChart points={scatterPoints} xLabel="Customers" yLabel="Orders" medianX={quadrants.medianX} medianY={quadrants.medianY} />
                <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  Quadrants are investigation signals based on today&apos;s fleet median, not performance judgments.
                </div>
                <div className="two-col" style={{ marginTop: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  {Object.values(QUADRANT_LABELS).map((q) => (
                    <div key={q.quadrant} style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 700 }}>{q.title}</div>
                      <div className="muted">{q.note}</div>
                    </div>
                  ))}
                </div>
              </ChartContainer>

              <div className="card">
                <div className="section-title">All Salesmen</div>
                <DataTable columns={columns} rows={env.data} getRowKey={(r) => r.salesman_id} />
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}
