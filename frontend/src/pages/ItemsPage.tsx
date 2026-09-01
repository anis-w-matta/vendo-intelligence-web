import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { ChartContainer } from "../components/charts/ChartContainer";
import { RankingChart } from "../components/charts/RankingChart";
import { TrendLineChart } from "../components/charts/TrendLineChart";
import { DataTable, type Column } from "../components/DataTable";
import { formatNumber } from "../lib/format";
import type { CategoryRow, TopItemRow } from "../lib/types";

const itemColumns: Column<TopItemRow>[] = [
  { key: "name", header: "Item", render: (r) => <Link to={`/items/${r.item_nb}`}>{r.item_desc}</Link> },
  { key: "category", header: "Category", render: (r) => r.category ?? "—" },
  { key: "orders", header: "Orders", align: "right", render: (r) => formatNumber(r.order_count) },
  { key: "qty", header: "Item Qty", align: "right", render: (r) => formatNumber(r.item_quantity) },
  { key: "customers", header: "Customers", align: "right", render: (r) => formatNumber(r.customer_count) },
];

const categoryColumns: Column<CategoryRow>[] = [
  { key: "category", header: "Category", render: (r) => r.category },
  { key: "orders", header: "Orders", align: "right", render: (r) => formatNumber(r.order_count) },
  { key: "qty", header: "Item Qty", align: "right", render: (r) => formatNumber(r.item_quantity) },
  { key: "customers", header: "Customers", align: "right", render: (r) => formatNumber(r.customer_count) },
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
        {(env) => {
          // Customer-penetration ranking (gap #1): re-sorts the
          // already-fetched top-items-by-quantity list by customer_count
          // client-side rather than issuing a third catalog-service call -
          // catalog-service's top-items endpoint only supports order_by
          // "quantity"/"order_frequency", not customer_count. This is
          // therefore penetration among the top-quantity items only, not a
          // fleet-wide penetration ranking - never blended into a combined
          // score with the other two rankings.
          const topByCustomerPenetration = [...env.data.top_items_by_quantity].sort(
            (a, b) => b.customer_count - a.customer_count,
          );
          return (
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
                <ChartContainer
                  title="Top Items by Customer Penetration"
                  subtitle="Among the items above (top by quantity) - distinct customers who ordered it, not a fleet-wide ranking."
                  source={env.meta.source}
                  completeness={env.meta.completeness}
                >
                  <RankingChart
                    rows={topByCustomerPenetration.map((r) => ({ label: r.item_desc, value: r.customer_count }))}
                    valueLabel="Customers"
                  />
                </ChartContainer>
              </div>

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="section-title">Top Items</div>
                <DataTable columns={itemColumns} rows={env.data.top_items_by_quantity} getRowKey={(r) => r.item_nb} />
              </div>
            </>
          );
        }}
      </QueryBoundary>

      <QueryBoundary state={categoriesState}>
        {(env) => {
          const categoryTrends = env.data.filter((c) => c.trend);
          return (
            <>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="section-title">Categories</div>
                <DataTable columns={categoryColumns} rows={env.data} getRowKey={(r) => r.category} />
              </div>

              {categoryTrends.length > 0 && (
                <div className="chart-grid">
                  {categoryTrends.map((c) => (
                    <ChartContainer
                      key={c.category}
                      title={`Category Trend: ${c.category}`}
                      subtitle="Monthly item quantity - top categories by quantity only."
                      source={env.meta.source}
                      completeness={env.meta.completeness}
                      completenessNote={
                        (c.trend!.orders_excluded_missing_commit_date ?? 0) > 0
                          ? `${c.trend!.orders_excluded_missing_commit_date} order(s) excluded - no commit date recorded.`
                          : undefined
                      }
                    >
                      <TrendLineChart
                        points={c.trend!.points.map((p) => ({ bucket: p.bucket, value: Number(p.item_quantity) }))}
                      />
                    </ChartContainer>
                  ))}
                </div>
              )}
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}
