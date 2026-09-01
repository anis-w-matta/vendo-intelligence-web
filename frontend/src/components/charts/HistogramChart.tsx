import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../states/States";

export interface HistogramBar {
  bucket: string;
  count: number;
}

// A true histogram (server-computed, fixed-width buckets - e.g. items-per-
// order, backlog age, turnaround percentile ranges) - never a client-side
// binning of raw values.
export function HistogramChart({ bars }: { bars: HistogramBar[] }) {
  if (bars.length === 0) return <EmptyState body="No data for the current filters." />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={bars} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--text-faint)" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-faint)" }} tickLine={false} width={30} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
