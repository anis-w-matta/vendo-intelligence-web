import { useState } from "react";
import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { GlobalFilters } from "../components/filters/GlobalFilters";
import { QueryBoundary } from "../components/QueryBoundary";
import { PartialDataBanner } from "../components/states/States";
import { ChartContainer } from "../components/charts/ChartContainer";
import { HistogramChart } from "../components/charts/HistogramChart";
import { RankingChart } from "../components/charts/RankingChart";
import { DataTable, type Column } from "../components/DataTable";
import { formatNumber, formatPercent, formatSeconds } from "../lib/format";
import { bucketByWeek, totalsByDay } from "../lib/weekBucketing";
import { computeOperationalPressureFlags } from "../lib/operationalPressure";
import type { StatusCount } from "../lib/types";

interface RejectionRow { salesman_id: string; rejection_rate: number | null; request_count: number }

const rejectionColumns: Column<RejectionRow>[] = [
  { key: "salesman", header: "Salesman", render: (r) => r.salesman_id },
  { key: "requests", header: "Requests", align: "right", render: (r) => formatNumber(r.request_count) },
  { key: "rate", header: "Rejection Rate", align: "right", render: (r) => formatPercent(r.rejection_rate) },
];

// Request funnel step order and labels - status_counts' raw statuses
// (new/in_review/rejected/committed/callback) mapped to the funnel's
// vocabulary (Created/Claimed/terminal outcomes). "callback" is not part
// of the linear funnel: per OPEN_STATUSES in the Python backend it's
// still an open request awaiting follow-up, not a terminal outcome - it
// is shown as a side note, not invented into a stage it isn't.
const FUNNEL_STAGES: { status: string; label: string }[] = [
  { status: "new", label: "Created" },
  { status: "in_review", label: "Claimed" },
  { status: "committed", label: "Committed" },
  { status: "rejected", label: "Rejected" },
];

function countFor(statusCounts: StatusCount[], status: string): number {
  return statusCounts.find((s) => s.status === status)?.count ?? 0;
}

const eventTypeColumns: Column<{ event_type: string; count: number }>[] = [
  { key: "event_type", header: "Event Type", render: (r) => r.event_type },
  { key: "count", header: "Count", align: "right", render: (r) => formatNumber(r.count) },
];

export function OperationsPage() {
  const [filters, setFilters] = useFilters();
  const state = useApiQuery(() => api.operations(filters), [JSON.stringify(filters)]);
  const [granularity, setGranularity] = useState<"day" | "week">("week");

  return (
    <>
      <PageHeader title="Operations Command Center" subtitle="Backlog, turnaround, and rejection - no SLA is defined anywhere in this project, so none is shown.">
        <GlobalFilters filters={filters} onChange={setFilters} fields={["date", "salesman", "customer"]} />
      </PageHeader>

      <QueryBoundary state={state} onRetry={() => setFilters({ ...filters })}>
        {(env) => {
          const callbackCount = countFor(env.data.status_counts, "callback");
          const funnelMax = Math.max(1, ...FUNNEL_STAGES.map((s) => countFor(env.data.status_counts, s.status)));

          const dailyTotals = totalsByDay(env.data.volume_over_time);
          const volumeBars =
            granularity === "day"
              ? dailyTotals.map((d) => ({ bucket: d.day.slice(0, 10), count: d.count }))
              : bucketByWeek(dailyTotals).map((w) => ({ bucket: w.weekStart, count: w.count }));

          const hourBars = env.data.activity.by_hour.map((h) => ({
            bucket: String(h.hour).padStart(2, "0"),
            count: h.count,
          }));

          const pressureFlags = computeOperationalPressureFlags({
            ageBuckets: env.data.backlog.age_buckets,
            backlogTotal: env.data.backlog.total,
            p90Seconds: env.data.turnaround.p90_seconds,
            medianSeconds: env.data.turnaround.median_seconds,
            currentRejectionRate: env.data.rejection.rejection_rate,
            previousPeriodRejectionRate: env.data.rejection.previous_period_rejection_rate,
          });

          return (
            <>
              <PartialDataBanner note={env.meta.completeness_note} />
              <div className="kpi-grid">
                <div className="card kpi-card">
                  <div className="kpi-name">Backlog</div>
                  <div className="kpi-value">{formatNumber(env.data.backlog.total)}</div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-name">Median Turnaround</div>
                  <div className="kpi-value">{formatSeconds(env.data.turnaround.median_seconds)}</div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-name">P90 Turnaround</div>
                  <div className="kpi-value">{formatSeconds(env.data.turnaround.p90_seconds)}</div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-name">Rejection Rate</div>
                  <div className="kpi-value">{formatPercent(env.data.rejection.rejection_rate)}</div>
                </div>
              </div>

              {pressureFlags.length > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="section-title">Operational Pressure Signals</div>
                  <div className="muted" style={{ marginBottom: 10, fontSize: 12.5 }}>
                    Observations only, never a claimed cause - each flag describes a pattern in the data above, not a reason for it.
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {pressureFlags.map((f) => (
                      <li key={f.signal.type} style={{ marginBottom: 4, fontSize: 13 }}>{f.label}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="section-title">Request Funnel</div>
                <div className="muted" style={{ marginBottom: 12, fontSize: 12.5 }}>
                  Current status distribution, ordered Created → Claimed → Committed / Rejected. This is a snapshot of
                  current statuses, not a per-request conversion trace between stages.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {FUNNEL_STAGES.map((stage) => {
                    const count = countFor(env.data.status_counts, stage.status);
                    const widthPct = Math.max(4, (count / funnelMax) * 100);
                    return (
                      <div key={stage.status} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 90, fontSize: 12.5, color: "var(--text-muted)" }}>{stage.label}</div>
                        <div style={{ flex: 1, background: "var(--surface-alt)", borderRadius: 6, overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${widthPct}%`,
                              background: "var(--accent)",
                              color: "white",
                              fontSize: 12,
                              fontWeight: 600,
                              padding: "6px 8px",
                              borderRadius: 6,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatNumber(count)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                  Callback (open, awaiting follow-up - not a terminal outcome): {formatNumber(callbackCount)}
                </div>
              </div>

              <div className="chart-grid">
                <ChartContainer
                  title="Backlog Age"
                  subtitle="Open requests only (new / in_review / callback), bucketed by minutes since created."
                  source={env.meta.source}
                  completeness={env.meta.completeness}
                >
                  <HistogramChart bars={Object.entries(env.data.backlog.age_buckets).map(([bucket, count]) => ({ bucket, count }))} />
                </ChartContainer>
                <div className="card">
                  <div className="section-title">Rejection by Salesman</div>
                  <DataTable columns={rejectionColumns} rows={env.data.rejection_by_salesman} getRowKey={(r) => r.salesman_id} />
                </div>
              </div>

              <div className="chart-grid">
                <ChartContainer
                  title="Request Volume Over Time"
                  subtitle={
                    granularity === "week"
                      ? "Week totals - a client-side re-bucketing of the exact day-level counts below; no new business calculation."
                      : "Day totals, as returned by the backend."
                  }
                  source={env.meta.source}
                  completeness={env.meta.completeness}
                >
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button
                      type="button"
                      className={`btn${granularity === "day" ? " btn-primary" : ""}`}
                      style={{ padding: "2px 10px", fontSize: 12 }}
                      onClick={() => setGranularity("day")}
                    >
                      Day
                    </button>
                    <button
                      type="button"
                      className={`btn${granularity === "week" ? " btn-primary" : ""}`}
                      style={{ padding: "2px 10px", fontSize: 12 }}
                      onClick={() => setGranularity("week")}
                    >
                      Week
                    </button>
                  </div>
                  <HistogramChart bars={volumeBars} />
                </ChartContainer>

                <ChartContainer
                  title="Activity by Hour of Day"
                  subtitle="ActivityLog event counts by hour - UTC, not business-local time."
                  source={env.meta.source}
                  completeness={env.meta.completeness}
                >
                  <HistogramChart bars={hourBars} />
                </ChartContainer>
              </div>

              <div className="chart-grid">
                <div className="card">
                  <div className="section-title">Activity by Event Type</div>
                  {env.data.activity.by_event_type.length > 6 ? (
                    <DataTable
                      columns={eventTypeColumns}
                      rows={env.data.activity.by_event_type}
                      getRowKey={(r) => r.event_type}
                    />
                  ) : (
                    <RankingChart
                      rows={env.data.activity.by_event_type.map((e) => ({ label: e.event_type, value: e.count }))}
                      valueLabel="Events"
                    />
                  )}
                </div>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </>
  );
}
