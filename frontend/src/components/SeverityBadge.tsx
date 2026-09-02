import type { InsightSeverity } from "../lib/types";

// Phase 13 Insight Engine severity badge - same visual convention as
// CompletenessBadge (a pill using this app's shared .badge classes), but
// its own color scale (styles.css's --severity-* tokens) since severity
// is a different axis from data completeness: INFO/WATCH/WARNING/CRITICAL
// is a magnitude scale, not a "how much of the data do we have" scale.
// Renders the API's own severity value verbatim - never recomputed or
// softened client-side.
const LABEL: Record<InsightSeverity, string> = {
  INFO: "Info",
  WATCH: "Watch",
  WARNING: "Warning",
  CRITICAL: "Critical",
};

const CLASS: Record<InsightSeverity, string> = {
  INFO: "badge-severity-info",
  WATCH: "badge-severity-watch",
  WARNING: "badge-severity-warning",
  CRITICAL: "badge-severity-critical",
};

export function SeverityBadge({ severity }: { severity: InsightSeverity }) {
  return <span className={`badge ${CLASS[severity]}`}>{LABEL[severity]}</span>;
}
