import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { PartialDataBanner } from "../components/states/States";
import { ChartContainer } from "../components/charts/ChartContainer";
import { RankingChart } from "../components/charts/RankingChart";
import { DataTable, type Column } from "../components/DataTable";
import { formatNumber } from "../lib/format";
import type { SalesmanRow, TopCustomerRow } from "../lib/types";

const columns: Column<TopCustomerRow>[] = [
  { key: "name", header: "Customer", render: (r) => <Link to={`/customers/${r.cust_nb}`}>{r.customer_name}</Link> },
  { key: "nb", header: "Customer #", render: (r) => r.cust_nb },
  { key: "orders", header: "Orders", align: "right", render: (r) => formatNumber(r.order_count) },
  { key: "qty", header: "Item Qty", align: "right", render: (r) => formatNumber(r.item_quantity) },
];

const salesmanCustomerColumns: Column<SalesmanRow>[] = [
  { key: "name", header: "Salesman", render: (r) => <Link to={`/salesmen/${r.salesman_id}`}>{r.salesman_name ?? r.salesman_id}</Link> },
  { key: "customers", header: "Current Customers", align: "right", render: (r) => formatNumber(r.current_customer_count) },
];

export function CustomersPage() {
  const [filters, setFilters] = useFilters();
  const state = useApiQuery(() => api.customers(filters), [JSON.stringify(filters)]);
  // Reuses the existing /salesmen endpoint's current_customer_count per
  // salesman (live Customer.salesman_id headcount, not the order-attributed
  // customer_count) - not recomputed here, and not the fleet-wide
  // active/inactive classification, which is a separate, larger problem
  // left as the honest "not computed in this pass" caveat below.
  const salesmenState = useApiQuery(() => api.salesmen(filters), [JSON.stringify(filters)]);

  return (
    <>
      <PageHeader title="Customer Intelligence" subtitle="Portfolio and ranking - no revenue or order-value figures.">
        <GlobalFilters filters={filters} onChange={setFilters} fields={["date", "salesman"]} />
      </PageHeader>

      <QueryBoundary state={state} onRetry={() => setFilters({ ...filters })}>
        {(env) => (
          <>
            <PartialDataBanner note={env.meta.completeness_note} />
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
              <div className="card kpi-card">
                <div className="kpi-name">Total Customers</div>
                <div className="kpi-value">{formatNumber(env.data.summary.total)}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-name">Assigned</div>
                <div className="kpi-value">{formatNumber(env.data.summary.assigned)}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-name">Unassigned</div>
                <div className="kpi-value">{formatNumber(env.data.summary.unassigned)}</div>
              </div>
            </div>

            <div className="chart-grid">
              <ChartContainer title="Top Customers by Order Count" source={env.meta.source} completeness={env.meta.completeness}>
                <RankingChart
                  rows={env.data.top_customers_by_order_count.map((r) => ({ label: r.customer_name, value: r.order_count }))}
                  valueLabel="Orders"
                />
              </ChartContainer>
              <ChartContainer title="Top Customers by Item Quantity" source={env.meta.source} completeness={env.meta.completeness}>
                <RankingChart
                  rows={env.data.top_customers_by_item_quantity.map((r) => ({ label: r.customer_name, value: Number(r.item_quantity) }))}
                  valueLabel="Item Quantity"
                />
              </ChartContainer>
            </div>

            <div className="card">
              <div className="section-title">Top Customers by Order Count</div>
              <DataTable columns={columns} rows={env.data.top_customers_by_order_count} getRowKey={(r) => r.cust_nb} />
            </div>
          </>
        )}
      </QueryBoundary>

      <QueryBoundary state={salesmenState}>
        {(salesmenEnv) => {
          const bySalesman = [...salesmenEnv.data].sort((a, b) => b.current_customer_count - a.current_customer_count);
          return (
            <div className="chart-grid" style={{ marginTop: 20 }}>
              <ChartContainer
                title="Customers per Salesman"
                source={salesmenEnv.meta.source}
                completeness={salesmenEnv.meta.completeness}
                completenessNote={salesmenEnv.meta.completeness_note}
              >
                <RankingChart
                  rows={bySalesman.map((r) => ({ label: r.salesman_name ?? r.salesman_id, value: r.current_customer_count }))}
                  valueLabel="Current Customers"
                />
              </ChartContainer>
              <div className="card">
                <div className="section-title">Customers per Salesman</div>
                <DataTable columns={salesmanCustomerColumns} rows={bySalesman} getRowKey={(r) => r.salesman_id} />
              </div>
            </div>
          );
        }}
      </QueryBoundary>
    </>
  );
}
