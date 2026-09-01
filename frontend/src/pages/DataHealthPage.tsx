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
};

export function DataHealthPage() {
  const state = useApiQuery(() => api.dataHealth(), []);

  return (
    <>
      <PageHeader title="Data Health & Trust Center" subtitle="Never hide limitations. What the data can and cannot support." />
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

            <div className="card" style={{ marginTop: 14 }}>
              <div className="section-title">Metric Dictionary</div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Definition</th>
                      <th>Formula</th>
                      <th>Source</th>
                      <th>Limitations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {env.data.metric_dictionary.map((m) => (
                      <tr key={m.metric}>
                        <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{m.metric}</td>
                        <td style={{ whiteSpace: "normal", minWidth: 220 }}>{m.definition}</td>
                        <td style={{ whiteSpace: "normal", minWidth: 220, fontFamily: "monospace", fontSize: 12 }}>{m.formula}</td>
                        <td style={{ whiteSpace: "normal" }}>{m.source}</td>
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
