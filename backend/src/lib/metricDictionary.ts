// Phase 9 Data Health "Metric dictionary" - transcribed from the Phase 1
// audit's own findings (vendo-intelligence-web/docs/audit/
// 05_analytics_feasibility_matrix.md), not re-derived. Static content:
// no query backs this, it describes the queries other endpoints run.
export interface MetricDictionaryEntry {
  metric: string;
  definition: string;
  formula: string;
  source: string;
  filters: string[];
  limitations: string;
}

export const METRIC_DICTIONARY: MetricDictionaryEntry[] = [
  {
    metric: "Order Count",
    definition: "Number of distinct committed orders.",
    formula: "COUNT(DISTINCT (order_header.order_nb, order_header.order_type))",
    source: "catalog-service order_header",
    filters: ["date_from/date_to (committed_at)", "customer", "item", "category", "order_source", "salesman"],
    limitations: "Orders lacking committed_at (pre-Phase-2 legacy) are excluded from date/salesman-filtered results.",
  },
  {
    metric: "Order Line Count",
    definition: "Number of order_details rows.",
    formula: "COUNT(order_details.*)",
    source: "catalog-service order_details",
    filters: ["date_from/date_to (committed_at)", "customer", "item", "category", "order_source", "salesman"],
    limitations: "Same commit-date completeness caveat as Order Count.",
  },
  {
    metric: "Item Quantity",
    definition: "Total quantity ordered.",
    formula: "SUM(order_details.qty)",
    source: "catalog-service order_details",
    filters: ["date_from/date_to (committed_at)", "customer", "item", "category", "order_source", "salesman"],
    limitations: "Guarded by a DB CHECK constraint (qty > 0) since Phase 2 - zero/negative quantities cannot exist.",
  },
  {
    metric: "Salesman attribution (historical)",
    definition: "Who owned a customer at the moment a specific order was committed.",
    formula: "point-in-time lookup against customer_ownership_history at order_header.committed_at",
    source: "catalog-service customer_ownership_history",
    filters: ["date_from/date_to", "customer", "salesman"],
    limitations:
      "Only resolvable for orders with a committed_at (post-Phase-2). Never uses customer.salesman_id's current value for a historical order - that would misattribute after any reassignment.",
  },
  {
    metric: "Request Turnaround",
    definition: "Time from a request entering the queue to it being decided (rejected or committed).",
    formula: "decided_at - created_at, over status IN (rejected, committed)",
    source: "backend pending_request",
    filters: ["date_from/date_to (created_at)", "salesman", "customer", "status", "intent"],
    limitations:
      "For a committed request, decided_at marks when the commit attempt started, not when it finished. Only requests committed after Phase 2 shipped keep their row at all.",
  },
  {
    metric: "AI Correction Rate",
    definition: "Share of reviewed order lines a human edited.",
    formula: "COUNT(operator_edited = true) / COUNT(*), grouped by match_confidence bucket",
    source: "backend pending_request_line",
    filters: ["date_from/date_to", "salesman", "customer", "status", "intent"],
    limitations:
      "Scoped to requests whose PendingLine rows still exist - grows in completeness over time post-Phase-2, incomplete for anything committed before then.",
  },
];
