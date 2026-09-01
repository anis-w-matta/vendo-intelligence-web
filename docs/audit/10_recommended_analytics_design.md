# 10 — Recommended Analytics Design

> No financial data appears in this document, and none of the sourcing below reads price/revenue/amount fields.

How the future Node.js BFF should source each mandatory analytic from the master prompt, against the schema as it exists **today** (pre-phase-2), split into what's buildable now vs. blocked.

## Buildable today, against current schema

| Analytic | Source |
|---|---|
| Order Count / Order Lines / Item Quantity (current-period, no salesman breakdown) | `catalog-service.order_header` / `order_details`, per doc 02's canonical definitions |
| Items per order histogram | `GROUP BY (order_nb, order_type)` over `order_details`, count lines or sum qty per group |
| Request volume over time, by status | `backend.pending_request`, grouped by `created_at` bucket and `status` (excluding the phantom `committed` value — see doc 06 §6) |
| Backlog / backlog age / oldest request | `pending_request WHERE status IN ('new','in_review','callback')` |
| Turnaround (median/P75/P90/P95, histogram) | `decided_at - created_at` over **non-committed terminal** requests only (rejected/callback) — must be labeled as excluding committed requests, per doc 06 §3 |
| Rejection rate (overall, by salesman, trend) | `pending_request.status='rejected'` ÷ decided count; by-salesman via `assigned_to` |
| AI quality (confidence buckets, correction rate) | `pending_request_line.match_confidence`/`.operator_edited` — **pre-commit population only**, must be labeled as such |
| Top items/categories by quantity | `order_details` grouped by `item_nb`/joined `item.category` |
| Top items by order frequency | `COUNT(DISTINCT (order_nb, order_type))` grouped by `item_nb` |
| Current customer portfolio per salesman | `customer.salesman_id`, with an explicit "unassigned" bucket for NULL |
| Current top customers by order count / item quantity | `order_details`/`order_header` joined to `customer` on **current** `salesman_id`, or independent of salesman entirely (customer-level ranking doesn't need attribution at all — only the salesman-scoped views do) |
| Data Health completeness metrics (doc 09-listed) | Direct counts/percentages against the gaps documented in doc 06 |

## Blocked until phase 2 (doc 07/08/09 changes land)

| Analytic | Blocked by |
|---|---|
| Orders per salesman / item quantity per salesman, as a **historical trend** (not just current snapshot) | No commit-time salesman attribution (doc 07) |
| Salesman detail trends over time | Same |
| Turnaround / AI-quality metrics for **accepted and committed** requests | Request row deleted on commit (doc 06 §3/§7) |
| Any "orders on date X" or date-range order filtering | No order date exists (doc 06 §2) |
| "Requests that became orders" funnel (true create→commit funnel) | No durable lineage (doc 06 §3) |

For every blocked analytic, the Node BFF's response must use the master prompt's own vocabulary (`UNAVAILABLE`, not a fabricated zero) and the metric-contract fields the master prompt specifies (source, formula, completeness, last updated) should say plainly *why* — e.g. `"completeness": "UNAVAILABLE — no commit-time salesman attribution exists; see backend audit doc 07"`.

## Design implications carried forward to phase 3 (Node.js BFF)

- Every endpoint should compute aggregates server-side (in Node, or by asking the FastAPI services for filtered/paginated data and aggregating in Node) — neither existing service currently exposes pre-aggregated analytics endpoints, so phase 3 will need efficient use of the existing per-row endpoints (pagination, filtering by date/customer/item where those services already support it) rather than pulling full tables.
- Metrics that are "RELIABLE WITH CAVEAT" in doc 05 (e.g. item quantity, given the unguarded-qty gap) should still ship in phase 3/5/6, but the BFF's response should include the completeness caveat rather than waiting on the catalog-service constraint fix — the master prompt says "unknown must remain unknown," not "block all analytics until every gap is closed."
- The insights engine (phase 8) must not generate insights over any "blocked" analytic above (e.g. never say "Ahmed's historical orders increased 18%" — only "Ahmed's *current customer portfolio's* orders..." with the current-attribution caveat, or wait until phase 2 lands before enabling that specific insight).
