// Data Health page's "Metric Definitions" table. Formula/source fields are
// kept for internal use but are not shown on the page - definition and
// limitations are the only columns a sales-manager audience sees, so they
// stay in plain language.
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
    limitations: "Orders with no completion date on file are excluded from date- and salesman-filtered results.",
  },
  {
    metric: "Order Line Count",
    definition: "Number of order line items.",
    formula: "COUNT(order_details.*)",
    source: "catalog-service order_details",
    filters: ["date_from/date_to (committed_at)", "customer", "item", "category", "order_source", "salesman"],
    limitations: "Same completeness caveat as Order Count.",
  },
  {
    metric: "Item Quantity",
    definition: "Total quantity ordered.",
    formula: "SUM(order_details.qty)",
    source: "catalog-service order_details",
    filters: ["date_from/date_to (committed_at)", "customer", "item", "category", "order_source", "salesman"],
    limitations: "Quantities are always positive - a zero or negative quantity can't exist in the system.",
  },
  {
    metric: "Salesman attribution (historical)",
    definition: "Who owned a customer at the moment a specific order was placed.",
    formula: "point-in-time lookup against customer_ownership_history at order_header.committed_at",
    source: "catalog-service customer_ownership_history",
    filters: ["date_from/date_to", "customer", "salesman"],
    limitations:
      "Only resolvable for orders with a recorded completion date. Never uses a customer's current salesman for a historical order, since that would misattribute the order after any later reassignment.",
  },
  {
    metric: "Request Turnaround",
    definition: "Time from a request entering the queue to it being decided (rejected or committed).",
    formula: "decided_at - created_at, over status IN (rejected, committed)",
    source: "backend pending_request",
    filters: ["date_from/date_to (created_at)", "salesman", "customer", "status", "intent"],
    limitations:
      "For a committed request, the end time marks when the commit started, not when it finished. Only requests processed after our request-tracking upgrade are included.",
  },
  {
    metric: "AI Correction Rate",
    definition: "Share of reviewed order lines a human edited.",
    formula: "COUNT(operator_edited = true) / COUNT(*), grouped by match_confidence bucket",
    source: "backend pending_request_line",
    filters: ["date_from/date_to", "salesman", "customer", "status", "intent"],
    limitations:
      "Scoped to requests processed after our request-tracking upgrade; coverage improves over time.",
  },
  {
    metric: "Order Detail Item Reference Validity",
    definition: "Order lines whose item number does not match any item in the catalog.",
    formula: "COUNT(order_details WHERE NOT EXISTS item.item_number = order_details.item_nb)",
    source: "catalog-service order_details/item",
    filters: [],
    limitations:
      "A small number of order lines can reference an item that's no longer in the catalog, usually a discontinued or renamed item from an older system that was migrated in.",
  },
  {
    metric: "Customer-Salesman Assignment Completeness",
    definition: "Customers with a salesman currently assigned.",
    formula: "COUNT(customer.salesman_id IS NOT NULL) / COUNT(customer.*)",
    source: "catalog-service customer",
    filters: [],
    limitations:
      "Some customers imported from an older system had no salesman assignment recorded at the time. See the Data Health page's live completeness count for the current figure - assignments can change over time.",
  },
  {
    metric: "Duplicate Order Groups (heuristic)",
    definition: "Groups of 2+ orders sharing the same customer and the same completion time to the second.",
    formula: "COUNT(GROUP BY order_header.cust_nb, order_header.committed_at HAVING COUNT(*) > 1)",
    source: "catalog-service order_header",
    filters: [],
    limitations:
      "Deliberately narrow and conservative - likely under-counts real duplicates rather than risk flagging legitimate back-to-back orders as duplicates. A starting point to investigate, not an exhaustive count.",
  },
];
