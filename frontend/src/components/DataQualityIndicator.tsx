import type { DataHealthField } from "../lib/types";
import { CompletenessBadge } from "./CompletenessBadge";

export function DataQualityIndicator({ label, field }: { label: string; field: DataHealthField }) {
  const pct = field.pct ?? (field.violations !== undefined ? 100 : null);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
        <CompletenessBadge status={field.status as never} />
      </div>
      {pct !== null && (
        <div style={{ height: 6, borderRadius: 4, background: "var(--surface-alt)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: field.status === "COMPLETE" ? "var(--status-complete)" : "var(--status-partial)",
            }}
          />
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {field.violations !== undefined
          ? `${field.violations} violation(s) of ${field.total}`
          : `${field.count ?? 0} of ${field.total}${pct !== null ? ` (${pct}%)` : ""}`}
        {field.note && <> — {field.note}</>}
      </div>
    </div>
  );
}
