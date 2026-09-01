# 05 — Analytics Feasibility Matrix

> No financial data appears in this document, and no row below is a price/revenue/amount metric.

Status legend: **RELIABLE** (computable today, trustworthy) · **RELIABLE WITH CAVEAT** (computable, but a specific gap must be surfaced to the user) · **NOT AVAILABLE** (no data exists; must not be fabricated) · **NEEDS PHASE 2** (requires a schema change before it can be trusted).

| Metric | Authoritative source | Status | Notes |
|---|---|---|---|
| Order Count | `catalog-service.order_header`, distinct `(order_nb, order_type)` | RELIABLE | Composite PK confirmed structurally distinct from line count. |
| Order Line Count | `catalog-service.order_details` row count | RELIABLE | |
| Item Quantity | `SUM(order_details.qty)` | RELIABLE WITH CAVEAT | `qty` has no CHECK constraint; zero/negative values are possible and would currently be summed in. See doc 06. |
| Average items/order | Item Quantity ÷ Order Count over the same scope | RELIABLE WITH CAVEAT | Inherits the qty caveat above. |
| Customers | `catalog-service.customer` | RELIABLE | |
| Salesman ownership (current) | `customer.salesman_id` | RELIABLE WITH CAVEAT | ~40k legacy customers have `salesman_id IS NULL` (unassigned) — must be shown as "unassigned," never defaulted to a fabricated owner. |
| **Salesman ownership (historical, at order-commit time)** | — | **NOT AVAILABLE** | No column stores this; see doc 07. Any per-salesman metric that reports on past orders (not just current backlog) is, strictly, reporting "who owns this customer now," not "who sold this." Must be labeled as such until phase 2 adds real historical attribution. |
| Request count | `backend.pending_request` row existence + `activity_log` for deleted (committed) ones | RELIABLE WITH CAVEAT | Committed requests are hard-deleted from `pending_request`; only `activity_log(event_type="order_committed")` survives, and it carries far less detail (no line data, no AI confidence) than the original request. A true "all requests ever created" count needs `activity_log` combined with current `pending_request` rows, or a phase-2 change (see doc 08). |
| Request status (current) | `pending_request.status` | RELIABLE | `new / in_review / callback / rejected / committing`. `committed` is a defined enum value that is **never actually persisted** (row is deleted instead) — do not query for `status='committed'` expecting results. |
| `created_at` (request) | `pending_request.created_at` | RELIABLE WITH CAVEAT | This is **intake/draft time**, not an order date. Must never be labeled "order date" (see doc 06). |
| `claimed_at` | `pending_request.claimed_at` | RELIABLE | |
| `decided_at` | `pending_request.decided_at` | RELIABLE WITH CAVEAT | Doubles as both "final decision timestamp" (reject/callback) and "commit-attempt-started marker" (accept path) — semantics differ by which `status` the row was in. Also lost entirely once a request is committed (row deleted). |
| Commit information (which order a request became) | `pending_request.commit_intent_id` ↔ nothing durable after commit | **NOT AVAILABLE** post-commit | `committed_order_nb` field exists on the model but is never set in code. Once committed, there is no queryable link from the old request to the resulting order. See doc 06/08. |
| **Order date (when a committed order was placed)** | — | **NOT AVAILABLE** | `order_header.created_at` was deliberately dropped. No surviving timestamp anywhere describes commit time for a completed order. See doc 07/09. |
| AI confidence | `pending_request_line.match_confidence` | RELIABLE, pre-commit only | Lost once the request is committed and the row is deleted. Cannot be computed for historical (already-committed) orders. |
| Human edits | `pending_request_line.operator_edited`, `.change` | RELIABLE, pre-commit only | Same lifecycle caveat as AI confidence — not preserved post-commit. |
| Item / category | `catalog-service.item.category` | RELIABLE | Free-text column, not normalized — category names must be used exactly as stored (no fuzzy grouping) to avoid fabricating groupings that don't exist in source data. |
| Turnaround (`decided_at - created_at`) | `pending_request` | RELIABLE, pre-commit-decision only | Computable for rejected/callback requests (row persists). For accepted/committed requests, both timestamps existed transiently during the commit call but the row is deleted afterward — turnaround for *committed* requests is **not directly queryable today** unless captured into `activity_log` at commit time (it currently isn't — `activity_log` for `order_committed` doesn't include `created_at`/`decided_at`, confirmed by the fields listed in doc 02's `activity_log` schema: only `ts`, `cust_nb`, `order_nb`, `message`, `details`). |
| Rejection rate | `pending_request.status='rejected'` ÷ total decided | RELIABLE | Rejected rows are kept, not deleted. |
| Backlog (current) | `pending_request.status IN ('new','in_review','callback')` | RELIABLE | |
| Backlog age | `now() - pending_request.created_at` for open rows | RELIABLE | |

## Summary

Everything needed for **operational** metrics (requests, backlog, turnaround-on-non-committed-outcomes, rejection, current ownership) is reliable today. Everything needed for **historical sales attribution and order-date-based time-series** (orders per salesman over time, order volume trends by date, turnaround for accepted requests) is blocked on phase 2 changes, because the two pieces of data that would answer "when was this order placed, and who owned the customer at that time" were both deliberately removed from the schema and never replaced. This is the audit's central finding and the reason the master prompt insists phase 2 (data foundation) cannot be skipped.
