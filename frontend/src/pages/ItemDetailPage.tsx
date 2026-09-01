import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { PageHeader } from "../components/layout/PageHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { KpiCard } from "../components/KpiCard";
import type { EnvelopeMeta, Metric } from "../lib/types";

function statMetric<T>(name: string, value: T, unit: string, meta: EnvelopeMeta): Metric<T> {
  return {
    name, value, unit, period: meta.period, filters: meta.filters,
    source: meta.source, formula: meta.formula ?? "", completeness: meta.completeness,
    completeness_note: meta.completeness_note, last_updated: meta.last_updated,
  };
}

// The BFF exposes GET /items/:id (see backend/src/routes/items.ts) though
// Phase 5's route list doesn't spell it out explicitly - added to mirror
// the customer drill-down pattern already established on /customers.
export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useApiQuery(() => api.itemDetail(id!), [id]);

  return (
    <>
      <div className="breadcrumb"><Link to="/items">← Item Intelligence</Link></div>
      <QueryBoundary state={state}>
        {(env) => {
          const d = env.data;
          return (
            <>
              <PageHeader title={d.item_desc} subtitle={`Item #${d.item_nb}${d.category ? ` · ${d.category}` : ""}`} />
              <div className="kpi-grid">
                <KpiCard metric={statMetric("Item Quantity", d.item_quantity, "units", env.meta)} />
                <KpiCard metric={statMetric("Orders", d.order_count, "orders", env.meta)} />
                <KpiCard metric={statMetric("Avg Qty / Occurrence", d.avg_qty_per_occurrence, "units", env.meta)} />
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}
