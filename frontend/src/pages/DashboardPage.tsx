import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { KpiCard } from "../components/KpiCard";
import { ChartContainer } from "../components/charts/ChartContainer";
import { RankingChart } from "../components/charts/RankingChart";
import { TrendLineChart } from "../components/charts/TrendLineChart";
import { HistogramChart } from "../components/charts/HistogramChart";
import { EmptyState } from "../components/states/States";
import { formatNumber, formatDate, formatSeconds } from "../lib/format";

// Phase 14 (Gemini Intelligence Layer): a short, server-cached (see
// backend/src/lib/geminiClient.ts's BRIEFING_TTL_MS - at most once per
// calendar day per insight-set) manager briefing synthesized from the
// CURRENT real Insight list - never fabricated, never a source of new
// facts. Fetched once when the Command Center mounts (not re-fetched per
// filter change, since the briefing is deliberately fleet-wide) - this
// never costs an extra real Gemini call beyond what the server-side cache
// already allows once per day. A Gemini outage renders an honest
// "unavailable" message; it never blocks or breaks the rest of the page.
function ManagerBriefingCard() {
  const state = useApiQuery(() => api.briefing(), []);

  return (
    <div className="card">
      <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>Manager Briefing (AI)</span>
        <Link to="/insights" className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>
          Full Insight Engine &rarr;
        </Link>
      </div>
      {state.status === "loading" && (
        <div className="muted" style={{ fontSize: 11.5 }} role="status" aria-busy="true">
          Loading briefing…
        </div>
      )}
      {state.status === "error" && (
        <div className="muted" style={{ fontSize: 11.5 }} role="status">
          AI briefing unavailable right now.
        </div>
      )}
      {state.status === "success" && state.data.status === "unavailable" && (
        <div className="muted" style={{ fontSize: 11.5 }} role="status">
          AI briefing unavailable right now.
        </div>
      )}
      {state.status === "success" && state.data.status === "ok" && (
        <>
          <p style={{ fontSize: 12.5 }}>{state.data.briefing}</p>
          <div className="muted" style={{ fontSize: 11 }}>
            Based on {formatNumber(state.data.insight_count)} current insight(s) · generated {formatDate(state.data.generated_at)}
            {state.data.cached ? " (today's cached briefing)" : ""}
          </div>
        </>
      )}
    </div>
  );
}

// Fleet-wide "top N" ranking - the analytics endpoints return a longer list
// (or the caller's `limit` filter); the Command Center only ever shows a
// short preview so it stays a summary, not a duplicate of the dedicated
// Customers/Items pages.
const TOP_N = 5;

export function DashboardPage() {
  const [filters, setFilters] = useFilters();

  // The Command Center pulls from five already-built, already-tested BFF
  // endpoints. Rather than one QueryBoundary per card (five independent
  // loading/error states on one page would be its own kind of visual
  // noise), they're combined into a single fetch so the page renders once
  // all of its data is in, exactly like every other page's single
  // QueryBoundary pattern.
  const state = useApiQuery(
    () =>
      Promise.all([
        api.overview(filters),
        api.requests(filters),
        api.operations(filters),
        api.customers(filters),
        api.items(filters),
      ]),
    [JSON.stringify(filters)],
  );

  return (
    <>
      <PageHeader title="Command Center" subtitle="What is happening across VeNdO right now.">
        <GlobalFilters filters={filters} onChange={setFilters} fields={["date", "salesman"]} />
      </PageHeader>

      <QueryBoundary state={state} onRetry={() => setFilters({ ...filters })}>
        {([overview, requests, operations, customers, items]) => (
          <>
            {/* ---- Primary: the 8 required KPIs, always the most prominent thing on the page ---- */}
            <div className="kpi-grid">
              {Object.values(overview.kpis).map((m) => (
                <KpiCard key={m.name} metric={m} />
              ))}
            </div>

            {/* ---- Primary: fleet trend + the salesman ranking that drives drill-down ---- */}
            <div className="chart-grid">
              <ChartContainer
                title="Orders by Salesman"
                subtitle="Current customer-portfolio attribution - click a bar to drill into that salesman"
                source={overview.sales_by_salesman.meta.source}
                completeness={overview.sales_by_salesman.meta.completeness}
                completenessNote={overview.sales_by_salesman.meta.completeness_note}
              >
                <RankingChart
                  rows={overview.sales_by_salesman.data.map((r) => ({
                    label: r.salesman_name ?? r.salesman_id ?? "Unattributed",
                    value: r.order_count,
                    linkTo: r.salesman_id ? `/salesmen/${encodeURIComponent(r.salesman_id)}` : undefined,
                  }))}
                  valueLabel="Orders"
                />
              </ChartContainer>

              <ChartContainer
                title="Order & Item Volume Trend"
                subtitle="Monthly, fleet-wide"
                source={overview.order_trend.meta.source}
                completeness={overview.order_trend.meta.completeness}
                completenessNote={overview.order_trend.meta.completeness_note}
              >
                <div className="muted" style={{ fontSize: 11, marginBottom: -6 }}>Orders</div>
                <TrendLineChart
                  points={overview.order_trend.data.map((p) => ({ bucket: p.bucket, value: p.order_count }))}
                />
                <div className="muted" style={{ fontSize: 11, marginTop: 4, marginBottom: -6 }}>Item Quantity</div>
                <TrendLineChart
                  points={overview.order_trend.data.map((p) => ({ bucket: p.bucket, value: Number(p.item_quantity) }))}
                />
              </ChartContainer>

              <ChartContainer
                title="Request Volume Over Time"
                source={overview.request_volume_over_time.meta.source}
                completeness={overview.request_volume_over_time.meta.completeness}
              >
                <TrendLineChart
                  points={overview.request_volume_over_time.data.map((p) => ({ bucket: p.bucket, value: p.count }))}
                />
              </ChartContainer>
            </div>

            {/* ---- Secondary: short activity rankings - full detail lives on the Customers/Items pages ---- */}
            <div className="section-title" style={{ marginTop: 4 }}>Activity</div>
            <div className="chart-grid">
              <ChartContainer
                title="Top Customers by Order Count"
                subtitle={`Top ${TOP_N} - see the Customers page for the full ranking`}
                source={customers.meta.source}
                completeness={customers.meta.completeness}
                completenessNote={customers.meta.completeness_note}
              >
                <RankingChart
                  rows={customers.data.top_customers_by_order_count.slice(0, TOP_N).map((r) => ({
                    label: r.customer_name,
                    value: r.order_count,
                    linkTo: `/customers/${encodeURIComponent(r.cust_nb)}`,
                  }))}
                  valueLabel="Orders"
                />
              </ChartContainer>

              <ChartContainer
                title="Top Items by Quantity"
                subtitle={`Top ${TOP_N} - see the Items page for the full ranking`}
                source={items.meta.source}
                completeness={items.meta.completeness}
                completenessNote={items.meta.completeness_note}
              >
                <RankingChart
                  rows={items.data.top_items_by_quantity.slice(0, TOP_N).map((r) => ({
                    label: r.item_desc,
                    value: Number(r.item_quantity),
                    linkTo: `/items/${encodeURIComponent(r.item_nb)}`,
                  }))}
                  valueLabel="Item Qty"
                />
              </ChartContainer>

              <ChartContainer
                title="Request Status Breakdown"
                source={requests.meta.source}
                completeness={requests.meta.completeness}
              >
                <RankingChart
                  rows={requests.data.status_counts.map((s) => ({ label: s.status, value: s.count }))}
                  valueLabel="Requests"
                />
              </ChartContainer>
            </div>

            {/* ---- Secondary: operational summary - full breakdown lives on the Operations page ---- */}
            <div className="section-title" style={{ marginTop: 4 }}>Operational Summary</div>
            <div className="chart-grid">
              <div className="card">
                <div className="two-col" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="stack" style={{ gap: 8 }}>
                      <div>
                        <span className="muted" style={{ fontSize: 12 }}>Current Backlog: </span>
                        <strong>{formatNumber(operations.data.backlog.total)}</strong>
                      </div>
                      <div>
                        <span className="muted" style={{ fontSize: 12 }}>Oldest Open Request: </span>
                        <strong>{formatDate(operations.data.backlog.oldest_created_at)}</strong>
                      </div>
                      <div>
                        <span className="muted" style={{ fontSize: 12 }}>Median Turnaround: </span>
                        <strong>{formatSeconds(operations.data.turnaround.median_seconds)}</strong>
                      </div>
                      <div>
                        <span className="muted" style={{ fontSize: 12 }}>P90 Turnaround: </span>
                        <strong>{formatSeconds(operations.data.turnaround.p90_seconds)}</strong>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Link to="/operations" className="btn btn-ghost">Full operations view →</Link>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Backlog age</div>
                <HistogramChart
                  bars={Object.entries(operations.data.backlog.age_buckets).map(([bucket, count]) => ({ bucket, count }))}
                />
              </div>

              <div className="card">
                <div className="section-title">Customer Portfolio</div>
                <p className="muted" style={{ marginTop: -4 }}>
                  {formatNumber(overview.customers.data.assigned)} assigned · {formatNumber(overview.customers.data.unassigned)} unassigned
                  {" "}of {formatNumber(overview.customers.data.total)} total customers.
                </p>
                <Link to="/customers" className="btn btn-ghost">View customers →</Link>
              </div>

              <div className="card">
                <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span>Attention Center</span>
                  <Link to="/insights" className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>
                    Full Insight Engine (all categories, with severity) &rarr;
                  </Link>
                </div>
                {/* Phase 12 (Anomaly Detection Engine): every insight below is
                    an evidence-backed observation, never a verdict - each
                    `reason` string is reconstructed entirely from the current
                    value, baseline, and sample size shown with it, per the
                    phase's own "no opaque black box" rule. An empty list here
                    means the engine ran and genuinely found nothing to flag -
                    it is never padded with a weak signal just to have
                    content (see overview.attention.note for exactly which
                    categories are covered and which two are not). */}
                {overview.attention.insights.length === 0 ? (
                  <EmptyState title="No signals in the current data" body={overview.attention.note} />
                ) : (
                  <>
                    <ul className="stack" style={{ margin: 0, paddingLeft: 0, listStyle: "none", gap: 10 }}>
                      {overview.attention.insights.map((insight) => (
                        <li key={insight.id} style={{ fontSize: 12.5, borderBottom: "1px solid var(--border, #e5e5e5)", paddingBottom: 8 }}>
                          <div>{insight.reason}</div>
                          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                            Sample size: {formatNumber(insight.sample_size)} · Current period: {insight.current_period.from === insight.current_period.to
                              ? insight.current_period.from
                              : `${insight.current_period.from} – ${insight.current_period.to}`}
                            {" "}· Baseline period: {insight.baseline_period.from} – {insight.baseline_period.to}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="muted" style={{ fontSize: 11, marginTop: 10 }}>{overview.attention.note}</div>
                  </>
                )}
              </div>

              <ManagerBriefingCard />
            </div>
          </>
        )}
      </QueryBoundary>
    </>
  );
}
