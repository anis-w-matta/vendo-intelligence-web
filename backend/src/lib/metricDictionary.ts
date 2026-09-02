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
  {
    metric: "Order Detail Item Reference Validity",
    definition: "Order lines whose item_nb does not match any row in the item catalog.",
    formula: "COUNT(order_details WHERE NOT EXISTS item.item_number = order_details.item_nb)",
    source: "catalog-service order_details/item",
    filters: [],
    limitations:
      "There is no DB foreign key from order_details to item (unlike order_details -> order_header, which is FK-enforced), so a bad reference is genuinely possible - most likely a discontinued/renamed item from the legacy ERP import. This is a real query result, checked, not assumed to be zero.",
  },
  {
    metric: "Customer-Salesman Assignment Completeness",
    definition: "Customers with a current salesman assigned (customer.salesman_id IS NOT NULL).",
    formula: "COUNT(customer.salesman_id IS NOT NULL) / COUNT(customer.*)",
    source: "catalog-service customer",
    filters: [],
    limitations:
      "Legacy ERP-imported customers historically had no salesman assignment at all (no source of truth existed for who sells to whom at import time) - see the Data Health page's live completeness count and Known Legacy Limitations for the current actual figure, not a fixed number here, since assignments can change over time via PATCH /customers/{cust_nb}/salesman.",
  },
  {
    metric: "Duplicate Order Groups (heuristic)",
    definition: "Groups of 2+ orders sharing the same customer and the same commit timestamp to the second.",
    formula: "COUNT(GROUP BY order_header.cust_nb, order_header.committed_at HAVING COUNT(*) > 1)",
    source: "catalog-service order_header",
    filters: [],
    limitations:
      "Deliberately narrow and conservative - likely UNDER-counts real duplicates (e.g. two legacy ERP-imported rows for the same sale landing a few seconds apart would not be caught) rather than risk flagging legitimate back-to-back orders as duplicates. A lower-bound signal to investigate, not an exhaustive duplicate count.",
  },
];
