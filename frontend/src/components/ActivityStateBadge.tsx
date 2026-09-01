import type { ActivityState } from "../lib/types";

// Reuses the existing completeness-badge color conventions from
// styles.css rather than inventing a new palette: New/Active/Stable read
// as neutral-to-positive (green), Declining/Dormant as attention (amber),
// Insufficient Data as neutral/muted (gray) - same as badge-complete/
// badge-partial/badge-unavailable elsewhere in the app. Renders the
// backend's activity_state string verbatim; never recomputes or predicts
// it client-side.
const CLASS: Record<ActivityState, string> = {
  New: "badge-complete",
  Active: "badge-complete",
  Stable: "badge-complete",
  Declining: "badge-partial",
  Dormant: "badge-partial",
  "Insufficient Data": "badge-unavailable",
};

export function ActivityStateBadge({ state }: { state: ActivityState }) {
  return <span className={`badge ${CLASS[state]}`}>{state}</span>;
}
