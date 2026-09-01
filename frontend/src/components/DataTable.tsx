import type { ReactNode } from "react";
import { EmptyState } from "./states/States";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export function DataTable<T>({ columns, rows, getRowKey, emptyBody }: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyBody?: string;
}) {
  if (rows.length === 0) return <EmptyState body={emptyBody ?? "No rows for the current filters."} />;
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.align === "right" ? { textAlign: "right" } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} style={c.align === "right" ? { textAlign: "right" } : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
