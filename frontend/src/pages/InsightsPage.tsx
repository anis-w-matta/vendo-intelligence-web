import { Link } from "react-router-dom";
import type { Insight, InsightCategory } from "../lib/types";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { UnavailableBlock, EmptyState } from "../components/states/States";
import { SeverityBadge } from "../components/SeverityBadge";
import { formatNumber, formatDate } from "../lib/format";

// Phase 13 Insight Engine - the full evidence-backed picture, grouped by
// category. Every card below renders every field the phase spec requires
// (category/severity/title/explanation/metric/current value/baseline/
// change/sample size/affected entity/timestamp/drill-down) - never a
// partial render. An empty category means the engine ran and genuinely
// found nothing there, same discipline as the Command Center's Attention
// Center (Phase 12) - see InsightsPage's own `note` from the API for
// exactly which categories were computed and which signals were
// deliberately scoped down or left out.
const CATEGORY_ORDER: InsightCategory[] = ["Sales", "Customer", "Item", "Operations", "AI", "Data Quality"];

function formatChange(insight: Insight): string {
  const sign = insight.change_abs >= 0 ? "+" : "";
  const abs = `${sign}${formatNumber(insight.change_abs)}`;
  if (insight.change_pct === null) return abs;
  const pctSign = insight.change_pct >= 0 ? "+" : "";
  return `${abs} (${pctSign}${insight.change_pct.toFixed(1)}%)`;
}

function InsightRow({ insight }: { insight: Insight }) {
  return (
    <li className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{insight.title}</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{insight.affected_entity}</div>
        </div>
        <SeverityBadge severity={insight.severity} />
      </div>

      <p style={{ fontSize: 12.5, margin: "8px 0" }}>{insight.explanation}</p>

      <div className="muted" style={{ fontSize: 11, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        <span>Metric: {insight.metric}</span>
        <span>Current: {formatNumber(insight.current_value)}</span>
        <span>Baseline: {formatNumber(insight.baseline)}</span>
        <span>Change: {formatChange(insight)}</span>
        <span>Sample size: {formatNumber(insight.sample_size)}</span>
        <span>Detected: {formatDate(insight.timestamp)}</span>
      </div>

      <div style={{ marginTop: 8 }}>
        <Link to={insight.drill_down} className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}>
          Investigate &rarr;
        </Link>
      </div>
    </li>
  );
}

function CategorySection({ category, insights }: { category: InsightCategory; insights: Insight[] }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-title">
        {category} <span className="muted" style={{ fontWeight: 400 }}>({insights.length})</span>
      </div>
      {insights.length === 0 ? (
        <EmptyState title="No signals in this category" body="The engine ran against this category's data and found nothing worth flagging." />
      ) : (
        <ul className="stack" style={{ margin: 0, paddingLeft: 0, listStyle: "none", gap: 10 }}>
          {insights.map((insight, i) => (
            <InsightRow key={`${category}-${i}`} insight={insight} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function InsightsPage() {
  const [filters, setFilters] = useFilters();
  const state = useApiQuery(() => api.insights(filters), [JSON.stringify(filters)]);

  return (
    <>
      <PageHeader title="Insights" subtitle="Evidence-backed observations only - never a fabricated finding.">
        <GlobalFilters filters={filters} onChange={setFilters} fields={["date", "salesman"]} />
      </PageHeader>
      <QueryBoundary state={state} onRetry={() => setFilters({ ...filters })}>
        {(data) =>
          data.status === "UNAVAILABLE" ? (
            <UnavailableBlock title="No insights yet" note={data.note} />
          ) : (
            <>
              {data.insights.length === 0 ? (
                <EmptyState title="No signals in the current data" body={data.note} />
              ) : (
                <>
                  {CATEGORY_ORDER.map((category) => (
                    <CategorySection
                      key={category}
                      category={category}
                      insights={data.insights.filter((i) => i.category === category)}
                    />
                  ))}
                  <p className="muted" style={{ fontSize: 11.5 }}>{data.note}</p>
                </>
              )}
            </>
          )
        }
      </QueryBoundary>
    </>
  );
}
