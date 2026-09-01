import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { KpiCard } from "../components/KpiCard";
import { ActivityStateBadge } from "../components/ActivityStateBadge";
import { InsightCard } from "../components/InsightCard";
import { DataTable, type Column } from "../components/DataTable";
import { ChartContainer } from "../components/charts/ChartContainer";
import { TrendLineChart } from "../components/charts/TrendLineChart";
import { formatDate, formatNumber } from "../lib/format";
import type {
  ActivitySignal, EnvelopeMeta, Metric, OwnershipHistoryRow, StatusCount, TopItemRow,
} from "../lib/types";

function statMetric<T>(name: string, value: T, unit: string, meta: EnvelopeMeta): Metric<T> {
  return {
    name, value, unit, period: meta.period, filters: meta.filters,
    source: meta.source, formula: meta.formula ?? "", completeness: meta.completeness,
    completeness_note: meta.completeness_note, last_updated: meta.last_updated,
  };
}

// Rounds an interval-stats day count for display without pretending to
// more precision than the underlying data supports; leaves null (never a
// fabricated zero) as-is for statMetric/KpiCard to render as "—".
function days(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

function signalCopy(signal: ActivitySignal): { title: string; body: string } {
  if (signal.type === "long_gap") {
    return {
      title: "Investigate: Long Gap Since Last Order",
      body:
        `No order in ${formatNumber(signal.daysSinceLastOrder)} day(s), well beyond this customer's own ` +
        `typical interval of about ${formatNumber(signal.baselineIntervalDays)} day(s).`,
    };
  }
  return {
    title: "Investigate: Unusual Order Quantity",
    body:
      `Most recent order quantity (${formatNumber(signal.mostRecentQuantity)}) is ` +
      `${signal.ratio >= 2 ? "well above" : "well below"} this customer's own prior average ` +
      `(${formatNumber(Math.round(signal.priorAverageQuantity * 10) / 10)}), a ${signal.ratio.toFixed(2)}x change.`,
  };
}

const ownershipColumns: Column<OwnershipHistoryRow>[] = [
  { key: "salesman", header: "Salesman", render: (r) => r.salesman_id ?? "(unassigned)" },
  { key: "from", header: "Effective From", render: (r) => formatDate(r.effective_from) },
  { key: "to", header: "Effective To", render: (r) => (r.effective_to ? formatDate(r.effective_to) : "current") },
];

const statusColumns: Column<StatusCount>[] = [
  { key: "status", header: "Status", render: (r) => r.status },
  { key: "count", header: "Count", align: "right", render: (r) => formatNumber(r.count) },
];

const topItemColumns: Column<TopItemRow>[] = [
  { key: "name", header: "Item", render: (r) => <Link to={`/items/${r.item_nb}`}>{r.item_desc}</Link> },
  { key: "category", header: "Category", render: (r) => r.category ?? "—" },
  { key: "orders", header: "Orders", align: "right", render: (r) => formatNumber(r.order_count) },
  { key: "qty", header: "Item Qty", align: "right", render: (r) => formatNumber(r.item_quantity) },
];

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [filters] = useFilters();
  const state = useApiQuery(() => api.customerDetail(id!, filters), [id, JSON.stringify(filters)]);

  return (
    <>
      <div className="breadcrumb"><Link to="/customers">← Customer Intelligence</Link></div>

      <QueryBoundary state={state}>
        {(env) => {
          const c = env.data.customer;
          const stats = env.data.interval_stats;
          return (
            <>
              <PageHeader
                title={c.customer_name}
                subtitle={`Customer #${c.cust_nb} · Current salesman: ${c.current_salesman_id ?? "unassigned"}`}
              >
                <div style={{ marginTop: 6 }}>
                  <ActivityStateBadge state={env.data.activity_state} />
                </div>
              </PageHeader>

              <div className="kpi-grid">
                <KpiCard metric={statMetric("Orders", c.order_count, "orders", env.meta)} />
                <KpiCard metric={statMetric("Order Lines", c.order_line_count, "lines", env.meta)} />
                <KpiCard metric={statMetric("Item Quantity", c.item_quantity, "units", env.meta)} />
                <KpiCard metric={statMetric("Avg Items/Order", c.avg_items_per_order, "units", env.meta)} />
              </div>

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="section-title">Order Activity</div>
                <p className="muted" style={{ marginTop: -4 }}>
                  Frequency, typical interval, recent activity, longest gap, and active days - computed from this
                  customer's committed order history only. Never a prediction of future behavior.
                </p>
                <div className="kpi-grid">
                  <KpiCard metric={statMetric("Frequency", stats.orderCount, "orders", env.meta)} />
                  <KpiCard metric={statMetric("Typical Interval (avg)", days(stats.avgIntervalDays), "days", env.meta)} />
                  <KpiCard metric={statMetric("Typical Interval (median)", days(stats.medianIntervalDays), "days", env.meta)} />
                  <KpiCard metric={statMetric("Most Recent Interval", days(stats.recentIntervalDays), "days", env.meta)} />
                  <KpiCard metric={statMetric("Recent Activity (days since last order)", days(stats.daysSinceLastOrder), "days", env.meta)} />
                  <KpiCard metric={statMetric("Longest Gap", days(stats.longestGapDays), "days", env.meta)} />
                  <KpiCard metric={statMetric("Active Days", stats.activeDays, "days", env.meta)} />
                </div>
              </div>

              {env.data.signals.length > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="section-title">Signals</div>
                  {env.data.signals.map((s, i) => {
                    const { title, body } = signalCopy(s);
                    return <InsightCard key={i} icon="⚠" title={title} body={body} />;
                  })}
                </div>
              )}

              <div className="chart-grid">
                <ChartContainer
                  title="Order Trend"
                  subtitle="Order count per month for this customer"
                  source={env.meta.source}
                  completeness={env.meta.completeness}
                  completenessNote={env.meta.completeness_note}
                >
                  <TrendLineChart
                    points={env.data.order_trend.points.map((p) => ({ bucket: p.bucket, value: p.order_count }))}
                  />
                </ChartContainer>
                <div className="card">
                  <div className="section-title">Top Items</div>
                  <DataTable columns={topItemColumns} rows={env.data.top_items} getRowKey={(r) => r.item_nb} />
                </div>
              </div>

              <div className="two-col">
                <div className="card">
                  <div className="section-title">Ownership History</div>
                  <DataTable columns={ownershipColumns} rows={env.data.ownership_history} getRowKey={(r) => `${r.salesman_id}-${r.effective_from}`} />
                </div>
                <div className="card">
                  <div className="section-title">Request Activity</div>
                  <DataTable columns={statusColumns} rows={env.data.request_activity.status_counts} getRowKey={(r) => r.status} />
                  <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
                    Backlog: {formatNumber(env.data.request_activity.backlog.total)} open request(s)
                  </p>
                </div>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}
