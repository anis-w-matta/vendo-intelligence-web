import type { ReactNode } from "react";
import type { CompletenessStatus } from "../../lib/types";
import { CompletenessBadge } from "../CompletenessBadge";
import { InfoTip } from "../InfoTip";

export function ChartContainer({
  title,
  subtitle,
  source,
  formula,
  completeness,
  completenessNote,
  children,
}: {
  title: string;
  subtitle?: string;
  source?: string;
  formula?: string;
  completeness?: CompletenessStatus;
  completenessNote?: string;
  children: ReactNode;
}) {
  return (
    <div className="card chart-container">
      <div className="chart-title">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {title}
          {source && <InfoTip source={source} formula={formula} note={completenessNote} />}
        </span>
        {completeness && <CompletenessBadge status={completeness} />}
      </div>
      {subtitle && <div className="chart-subtitle">{subtitle}</div>}
      {children}
    </div>
  );
}
