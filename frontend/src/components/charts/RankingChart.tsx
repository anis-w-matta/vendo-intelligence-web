import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "../../lib/format";
import { EmptyState } from "../states/States";

export interface RankingRow {
  label: string;
  value: number;
  linkTo?: string;
}

// Horizontal bar - used for top salesmen / top customers / top items,
// wherever the master prompt calls for a ranking rather than a trend.
export function RankingChart({ rows, valueLabel = "Value" }: { rows: RankingRow[]; valueLabel?: string }) {
  if (rows.length === 0) return <EmptyState body="No data for the current filters." />;

  const height = Math.max(120, rows.length * 34);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-faint)" }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={140}
          tick={{ fontSize: 12, fill: "var(--text)" }}
          tickLine={false}
        />
        <Tooltip
          formatter={(value: number) => [formatNumber(value), valueLabel]}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {rows.map((_, i) => (
            <Cell key={i} fill="var(--accent)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
