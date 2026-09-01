import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { KpiCard } from "../components/KpiCard";
import { DataTable, type Column } from "../components/DataTable";
import { formatDate, formatNumber } from "../lib/format";
import type { EnvelopeMeta, Metric, OwnershipHistoryRow, StatusCount } from "../lib/types";

function statMetric<T>(name: string, value: T, unit: string, meta: EnvelopeMeta): Metric<T> {
  return {
    name, value, unit, period: meta.period, filters: meta.filters,
    source: meta.source, formula: meta.formula ?? "", completeness: meta.completeness,
    completeness_note: meta.completeness_note, last_updated: meta.last_updated,
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
          return (
            <>
              <PageHeader title={c.customer_name} subtitle={`Customer #${c.cust_nb} · Current salesman: ${c.current_salesman_id ?? "unassigned"}`} />

              <div className="kpi-grid">
                <KpiCard metric={statMetric("Orders", c.order_count, "orders", env.meta)} />
                <KpiCard metric={statMetric("Order Lines", c.order_line_count, "lines", env.meta)} />
                <KpiCard metric={statMetric("Item Quantity", c.item_quantity, "units", env.meta)} />
                <KpiCard metric={statMetric("Avg Items/Order", c.avg_items_per_order, "units", env.meta)} />
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
