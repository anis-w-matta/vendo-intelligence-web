import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { PageHeader } from "../components/layout/PageHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { KpiCard } from "../components/KpiCard";
import { InsightCard } from "../components/InsightCard";
import { ChartContainer } from "../components/charts/ChartContainer";
import { TrendLineChart } from "../components/charts/TrendLineChart";
import { DataTable, type Column } from "../components/DataTable";
import { formatNumber } from "../lib/format";
import {
  detectConcentratedCustomerSignal,
  detectHighFrequencyLowQuantitySignal,
  detectLowPenetrationSignal,
  detectQuantityTrendSignal,
  type ItemSignal,
} from "../lib/itemSignals";
import type { EnvelopeMeta, Metric, TopCustomerRow } from "../lib/types";

function statMetric<T>(name: string, value: T, unit: string, meta: EnvelopeMeta): Metric<T> {
  return {
    name, value, unit, period: meta.period, filters: meta.filters,
    source: meta.source, formula: meta.formula ?? "", completeness: meta.completeness,
    completeness_note: meta.completeness_note, last_updated: meta.last_updated,
  };
}

// Phase 9 signal copy - every title reads "Investigate: ...", every body
// states the evidence plainly, never a verdict. Same discipline as
// CustomerDetailPage's signalCopy (Phase 8) and SalesmanDetailPage's
// investigation-flag labels (Phase 7).
function signalCopy(signal: ItemSignal): { title: string; body: string } {
  switch (signal.type) {
    case "quantity_trend":
      return {
        title: "Investigate: Unusual Quantity Trend",
        body:
          `Most recent month's quantity (${formatNumber(signal.mostRecentQuantity)}) is ` +
          `${signal.ratio >= 1 ? "well above" : "well below"} the average of prior months ` +
          `(${formatNumber(Math.round(signal.priorAverageQuantity * 10) / 10)}), a ${signal.ratio.toFixed(2)}x change.`,
      };
    case "concentrated_customer":
      return {
        title: "Investigate: Demand Concentrated in One Customer",
        body:
          `${signal.topCustomerName} accounts for ${(signal.topCustomerShare * 100).toFixed(1)}% of this item's ` +
          "total quantity, among its known buyers (not a fleet-wide penetration figure).",
      };
    case "low_penetration":
      return {
        title: "Investigate: Low Customer Penetration",
        body:
          `Only ${formatNumber(signal.customerCount)} distinct customer(s) buy this item - well below the median ` +
          `of ${formatNumber(signal.populationMedianCustomerCount)} across the ${formatNumber(signal.populationSize)} ` +
          "item(s) currently in view (top items by quantity, not the full catalogue).",
      };
    case "high_frequency_low_quantity":
      return {
        title: "Investigate: Frequent Orders, Small Quantities",
        body:
          `Ordered ${formatNumber(signal.orderCount)} time(s) (population median ${formatNumber(signal.populationMedianOrderCount)}), ` +
          `but averaging only ${formatNumber(Math.round(signal.avgQuantityPerOrder * 10) / 10)} unit(s) per order ` +
          `(population median ${formatNumber(Math.round(signal.populationMedianAvgQuantityPerOrder * 10) / 10)}).`,
      };
    default: {
      const _exhaustive: never = signal;
      return _exhaustive;
    }
  }
}

const customerColumns: Column<TopCustomerRow>[] = [
  { key: "name", header: "Customer", render: (r) => <Link to={`/customers/${r.cust_nb}`}>{r.customer_name}</Link> },
  { key: "orders", header: "Orders", align: "right", render: (r) => formatNumber(r.order_count) },
  { key: "qty", header: "Item Qty", align: "right", render: (r) => formatNumber(r.item_quantity) },
];

// The BFF exposes GET /items/:id (see backend/src/routes/items.ts) though
// Phase 5's route list doesn't spell it out explicitly - added to mirror
// the customer drill-down pattern already established on /customers.
export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useApiQuery(() => api.itemDetail(id!), [id]);
  // Population for the low-penetration / high-frequency-low-quantity
  // signals below (Phase 9 gap #4): the default top-items-by-quantity
  // list (unfiltered, same endpoint ItemsPage uses). Documented in the
  // rendered signal copy as "the item(s) currently in view" - never
  // claimed to be every item in the catalogue.
  const populationState = useApiQuery(() => api.items({}), []);

  return (
    <>
      <div className="breadcrumb"><Link to="/items">← Item Intelligence</Link></div>
      <QueryBoundary state={state}>
        {(env) => {
          const d = env.data;

          const trendPoints = d.order_trend.points.map((p) => ({ bucket: p.bucket, value: Number(p.item_quantity) }));
          const topCustomersForSignal = d.top_customers.map((c) => ({
            customerName: c.customer_name,
            itemQuantity: Number(c.item_quantity),
          }));

          const population = populationState.status === "success"
            ? populationState.data.data.top_items_by_quantity
            : [];
          const populationCustomerCounts = population.map((r) => r.customer_count);
          const populationFrequencyQuantity = population.map((r) => ({
            orderCount: r.order_count,
            itemQuantity: Number(r.item_quantity),
          }));

          const signals = [
            detectQuantityTrendSignal(trendPoints),
            detectConcentratedCustomerSignal(topCustomersForSignal, Number(d.item_quantity)),
            detectLowPenetrationSignal(d.customer_count, populationCustomerCounts),
            detectHighFrequencyLowQuantitySignal(
              { orderCount: d.order_count, itemQuantity: Number(d.item_quantity) },
              populationFrequencyQuantity,
            ),
          ].filter((s): s is ItemSignal => s !== null);

          return (
            <>
              <PageHeader title={d.item_desc} subtitle={`Item #${d.item_nb}${d.category ? ` · ${d.category}` : ""}`} />
              <div className="kpi-grid">
                <KpiCard metric={statMetric("Item Quantity", d.item_quantity, "units", env.meta)} />
                <KpiCard metric={statMetric("Orders", d.order_count, "orders", env.meta)} />
                <KpiCard metric={statMetric("Avg Qty / Occurrence", d.avg_qty_per_occurrence, "units", env.meta)} />
                <KpiCard metric={statMetric("Customers", d.customer_count, "customers", env.meta)} />
              </div>

              {signals.length > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="section-title">Signals</div>
                  {signals.map((s, i) => {
                    const { title, body } = signalCopy(s);
                    return <InsightCard key={i} icon="⚠" title={title} body={body} />;
                  })}
                </div>
              )}

              <div className="chart-grid">
                <ChartContainer
                  title="Item Quantity Trend"
                  subtitle="Item quantity per month for this item"
                  source={env.meta.source}
                  completeness={env.meta.completeness}
                  completenessNote={env.meta.completeness_note}
                >
                  <TrendLineChart points={trendPoints} />
                </ChartContainer>
                <div className="card">
                  <div className="section-title">Top Customers for This Item</div>
                  <p className="muted" style={{ marginTop: -4, fontSize: 12 }}>
                    The Item x Customer matrix, bounded to this item's top customers by quantity - not a full
                    item x customer grid across every customer.
                  </p>
                  <DataTable columns={customerColumns} rows={d.top_customers} getRowKey={(r) => r.cust_nb} />
                </div>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}
