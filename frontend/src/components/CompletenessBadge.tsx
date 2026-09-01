import type { CompletenessStatus } from "../lib/types";

// The data-quality indicator every metric/table carries. Deliberately
// renders the API's own completeness value verbatim - never infers or
// softens it client-side.
const LABEL: Record<CompletenessStatus, string> = {
  COMPLETE: "Complete",
  PARTIAL: "Partial",
  LIMITED: "Limited",
  UNAVAILABLE: "Unavailable",
};

const CLASS: Record<CompletenessStatus, string> = {
  COMPLETE: "badge-complete",
  PARTIAL: "badge-partial",
  LIMITED: "badge-limited",
  UNAVAILABLE: "badge-unavailable",
};

export function CompletenessBadge({ status }: { status: CompletenessStatus }) {
  return <span className={`badge ${CLASS[status]}`}>{LABEL[status]}</span>;
}
