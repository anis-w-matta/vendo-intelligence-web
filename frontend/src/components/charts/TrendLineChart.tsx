import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../states/States";

export interface TrendPoint {
  bucket: string;
  value: number;
}

// Request-volume-over-time, and any other "value over a date bucket" series.
export function TrendLineChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) return <EmptyState body="No data for the current filters." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--text-faint)" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-faint)" }} tickLine={false} width={36} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
        <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
