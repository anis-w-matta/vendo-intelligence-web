import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { ChartContainer } from "../components/charts/ChartContainer";
import { RankingChart } from "../components/charts/RankingChart";
import { DataTable, type Column } from "../components/DataTable";
import { formatNumber } from "../lib/format";
import type { CategoryRow, TopItemRow } from "../lib/types";

const itemColumns: Column<TopItemRow>[] = [
  { key: "name", header: "Item", render: (r) => <Link to={`/items/${r.item_nb}`}>{r.item_desc}</Link> },
  { key: "category", header: "Category", render: (r) => r.category ?? "—" },
  { key: "orders", header: "Orders", align: "right", render: (r) => formatNumber(r.order_count) },
  { key: "qty", header: "Item Qty", align: "right", render: (r) => formatNumber(r.item_quantity) },
];

const categoryColumns: Column<CategoryRow>[] = [
  { key: "category", header: "Category", render: (r) => r.category },
  { key: "orders", header: "Orders", align: "right", render: (r) => formatNumber(r.order_count) },
  { key: "qty", header: "Item Qty", align: "right", render: (r) => formatNumber(r.item_quantity) },
  { key: "share", header: "Share of Quantity", align: "right", render: (r) => `${(Number(r.share_of_total_quantity) * 100).toFixed(1)}%` },
];

export function ItemsPage() {
  const [filters, setFilters] = useFilters();
  const itemsState = useApiQuery(() => api.items(filters), [JSON.stringify(filters)]);
  const categoriesState = useApiQuery(() => api.categories(filters), [JSON.stringify(filters)]);

  return (
    <>
      <PageHeader title="Item Intelligence" subtitle="Quantity and order-frequency rankings - no price data.">
        <GlobalFilters filters={filters} onChange={setFilters} fields={["date", "salesman", "category"]} />
      </PageHeader>

      <QueryBoundary state={itemsState} onRetry={() => setFilters({ ...filters })}>
        {(env) => (
          <>
            <div className="chart-grid">
              <ChartContainer title="Top Items by Quantity" source={env.meta.source} completeness={env.meta.completeness}>
                <RankingChart
                  rows={env.data.top_items_by_quantity.map((r) => ({ label: r.item_desc, value: Number(r.item_quantity) }))}
                  valueLabel="Item Quantity"
                />
              </ChartContainer>
              <ChartContainer title="Top Items by Order Frequency" source={env.meta.source} completeness={env.meta.completeness}>
                <RankingChart
                  rows={env.data.top_items_by_order_frequency.map((r) => ({ label: r.item_desc, value: r.order_count }))}
                  valueLabel="Orders"
                />
              </ChartContainer>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-title">Top Items</div>
              <DataTable columns={itemColumns} rows={env.data.top_items_by_quantity} getRowKey={(r) => r.item_nb} />
            </div>
          </>
        )}
      </QueryBoundary>

      <QueryBoundary state={categoriesState}>
        {(env) => (
          <div className="card">
            <div className="section-title">Categories</div>
            <DataTable columns={categoryColumns} rows={env.data} getRowKey={(r) => r.category} />
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
