import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart as RechartsScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "../../lib/format";
import { EmptyState } from "../states/States";
import type { Quadrant } from "../../lib/benchmarking";

export interface ScatterDatum {
  id: string;
  label: string;
  x: number;
  y: number;
  quadrant?: Quadrant;
}

// Fleet-wide workload-vs-output benchmarking scatter (Phase 7 #5/#6) - one
// point per salesman. medianX/medianY (when given) render as faint
// dashed reference lines splitting the chart into the same 4 quadrants
// frontend/src/lib/benchmarking.ts classifies points into - an
// investigation signal, not a performance judgment.
export function ScatterChart({
  points,
  xLabel,
  yLabel,
  medianX,
  medianY,
}: {
  points: ScatterDatum[];
  xLabel: string;
  yLabel: string;
  medianX?: number | null;
  medianY?: number | null;
}) {
  if (points.length === 0) return <EmptyState body="No data for the current filters." />;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RechartsScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          tick={{ fontSize: 11, fill: "var(--text-faint)" }}
          tickLine={false}
          label={{ value: xLabel, position: "insideBottom", offset: -4, fontSize: 11, fill: "var(--text-faint)" }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          tick={{ fontSize: 11, fill: "var(--text-faint)" }}
          tickLine={false}
          width={40}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--text-faint)" }}
        />
        {medianX !== null && medianX !== undefined && (
          <ReferenceLine x={medianX} stroke="var(--text-faint)" strokeDasharray="4 4" ifOverflow="extendDomain" />
        )}
        {medianY !== null && medianY !== undefined && (
          <ReferenceLine y={medianY} stroke="var(--text-faint)" strokeDasharray="4 4" ifOverflow="extendDomain" />
        )}
        <Tooltip
          cursor={{ strokeDasharray: "3 3", stroke: "var(--border)" }}
          content={({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const p = payload[0].payload as ScatterDatum;
            return (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, padding: "6px 10px" }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.label}</div>
                <div>{xLabel}: {formatNumber(p.x)}</div>
                <div>{yLabel}: {formatNumber(p.y)}</div>
              </div>
            );
          }}
        />
        <Scatter data={points} fill="var(--accent)" fillOpacity={0.75} />
      </RechartsScatterChart>
    </ResponsiveContainer>
  );
}
