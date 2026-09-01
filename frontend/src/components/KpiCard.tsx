import type { Metric } from "../lib/types";
import { formatNumber } from "../lib/format";
import { CompletenessBadge } from "./CompletenessBadge";
import { InfoTip } from "./InfoTip";

export function KpiCard({ metric }: { metric: Metric<unknown> }) {
  const raw = metric.value;
  const display =
    metric.completeness === "UNAVAILABLE" || raw === null || raw === undefined
      ? "—"
      : typeof raw === "number" || typeof raw === "string"
        ? formatNumber(raw as number | string)
        : String(raw);

  return (
    <div className="card kpi-card">
      <div className="kpi-name">
        <span>{metric.name}</span>
        <InfoTip source={metric.source} formula={metric.formula} note={metric.completeness_note} />
      </div>
      <div>
        <span className="kpi-value">{display}</span>
        {display !== "—" && <span className="kpi-unit">{metric.unit}</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <CompletenessBadge status={metric.completeness} />
      </div>
    </div>
  );
}
