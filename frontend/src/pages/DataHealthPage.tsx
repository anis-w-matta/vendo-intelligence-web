import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { PageHeader } from "../components/layout/PageHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { DataQualityIndicator } from "../components/DataQualityIndicator";

const FIELD_LABELS: Record<string, string> = {
  orders_with_committed_at: "Orders with a commit date",
  orders_with_resolvable_salesman_attribution: "Orders with resolvable salesman attribution",
  order_details_qty_constraint: "Order lines violating the qty > 0 constraint",
  requests_with_committed_order_lineage: "Requests with surviving order lineage",
  order_details_orphaned: "Order lines referencing a nonexistent order (orphaned)",
  order_details_invalid_item_ref: "Order lines referencing an unknown item",
  orders_with_no_lines: "Order headers with at least one line",
  customers_with_salesman: "Customers assigned to a salesman",
};

export function DataHealthPage() {
  const state = useApiQuery(() => api.dataHealth(), []);

  return (
    <>
      <PageHeader title="Data Health & Trust Center" subtitle="How complete and reliable the underlying data is." />
      <QueryBoundary state={state}>
        {(env) => (
          <>
            <div className="two-col">
              <div className="card">
                <div className="section-title">Completeness</div>
                {Object.entries(env.data.completeness).map(([key, field]) => (
                  <DataQualityIndicator key={key} label={FIELD_LABELS[key] ?? key} field={field} />
                ))}
              </div>

              <div className="card">
                <div className="section-title">Known Legacy Limitations</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {env.data.legacy_data_limitations.map((line, i) => (
                    <li key={i} style={{ marginBottom: 8, fontSize: 13 }}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="two-col" style={{ marginTop: 14 }}>
              <div className="card">
                <div className="section-title">Reconciliation: Order Headers vs Order Details</div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                  Order counts and their line-item counts, side by side.
                </div>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <tbody>
                      <tr>
                        <td>Total order headers</td>
                        <td className="text-right">{env.data.reconciliation.headers_details_quantity.total_order_headers.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td>Order headers with at least one line</td>
                        <td className="text-right">
                          {env.data.reconciliation.headers_details_quantity.order_headers_with_at_least_one_line.toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td>Order headers with no lines</td>
                        <td className="text-right">
                          {env.data.reconciliation.headers_details_quantity.order_headers_with_no_lines.toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td>Total order detail rows</td>
                        <td className="text-right">{env.data.reconciliation.headers_details_quantity.total_order_detail_rows.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  {env.data.reconciliation.headers_details_quantity.note}
                </p>
              </div>

              <div className="card">
                <div className="section-title">Reconciliation: Requests vs Committed Orders</div>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <tbody>
                      <tr>
                        <td>Requests with committed order lineage</td>
                        <td className="text-right">
                          {env.data.reconciliation.requests_vs_committed_orders.requests_with_committed_order_lineage.toLocaleString()}
                          {" "}/ {env.data.reconciliation.requests_vs_committed_orders.total_requests.toLocaleString()}
                        </td>
                      </tr>
                      <tr>
                        <td>Order headers with a commit date</td>
                        <td className="text-right">
                          {env.data.reconciliation.requests_vs_committed_orders.orders_with_committed_at.toLocaleString()}
                          {" "}/ {env.data.reconciliation.requests_vs_committed_orders.total_orders.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  {env.data.reconciliation.requests_vs_committed_orders.note}
                </p>
              </div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <div className="section-title">Duplicate Orders</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 700 }}>{env.data.duplicate_orders.groups.toLocaleString()}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  candidate group{env.data.duplicate_orders.groups === 1 ? "" : "s"}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                <strong>Heuristic:</strong> {env.data.duplicate_orders.heuristic}
              </div>
              <p style={{ fontSize: 13, margin: 0 }}>{env.data.duplicate_orders.caveat}</p>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <div className="section-title">Metric Definitions</div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Definition</th>
                      <th>Limitations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {env.data.metric_dictionary.map((m) => (
                      <tr key={m.metric}>
                        <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{m.metric}</td>
                        <td style={{ whiteSpace: "normal", minWidth: 220 }}>{m.definition}</td>
                        <td style={{ whiteSpace: "normal", minWidth: 260 }}>{m.limitations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </QueryBoundary>
    </>
  );
}
