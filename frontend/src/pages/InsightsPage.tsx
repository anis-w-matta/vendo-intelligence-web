import { api } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useFilters } from "../hooks/useFilters";
import { PageHeader } from "../components/layout/PageHeader";
import { QueryBoundary } from "../components/QueryBoundary";
import { UnavailableBlock } from "../components/states/States";
import { InsightCard } from "../components/InsightCard";

export function InsightsPage() {
  const [filters] = useFilters();
  const state = useApiQuery(() => api.insights(filters), [JSON.stringify(filters)]);

  return (
    <>
      <PageHeader title="Insights" subtitle="Evidence-backed observations only - never a fabricated finding." />
      <QueryBoundary state={state}>
        {(data) =>
          data.status === "UNAVAILABLE" || data.insights.length === 0 ? (
            <UnavailableBlock title="No insights yet" note={data.note} />
          ) : (
            <div className="stack">
              {data.insights.map((insight, i) => (
                <InsightCard key={i} title="Insight" body={JSON.stringify(insight)} />
              ))}
            </div>
          )
        }
      </QueryBoundary>
    </>
  );
}
