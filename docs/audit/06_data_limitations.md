# 06 — Data Limitations

> No financial data appears in this document.

Concrete, verified gaps found while tracing the live schema and code (not hypothetical):

## 1. No historical salesman attribution
Neither `order_header` nor `order_details` has a salesman column. `Customer.salesman_id` is a single mutable current-value column. If a customer is reassigned from Salesman A to Salesman B, every past order for that customer will report as belonging to B the moment `Customer.salesman_id` changes — because every query joins to the customer's *current* row, there is no snapshot. See doc 07 for the full risk writeup.

## 2. No durable order date
`order_header.created_at` was deliberately dropped by migration `5910168e3bcc` (its own docstring records this was intentional, along with removing the "which order did a customer place on date X" feature it supported). `pending_request.created_at` is intake time, not commit time, and the row is deleted on commit anyway. There is currently no timestamp in either database that means "when was this order placed" for a completed order.

## 3. No order↔request lineage after commit
`commit_intent_id` correlates a request to its resulting order only during the commit call itself. Once committed, `pending_request` (and its lines) is hard-deleted (`session.delete(req)` in `commit.py`). The `committed_order_nb` field exists on the `PendingRequest` model but is dead code — nothing ever sets it before the row disappears. `activity_log` records the commit event but only with `cust_nb`/`order_nb`/`message`/`details` — not the original request's line data, AI confidence, or edit history.

**Consequence**: "requests per salesman that became committed orders," "average time from request to committed order," and "AI accuracy on requests that were ultimately accepted" cannot be computed for any request that has already been committed, only reconstructed approximately (if at all) from `activity_log.details`, whose exact JSON shape was not part of this audit's scope and should be checked against the real logged payload before phase 2 designs around it.

## 4. Unguarded item quantity
`order_details.qty` (`Numeric(12,3)`) has no DB CHECK constraint, no Pydantic field validator (`gt=0`/`ge=0`), and the service layer only rejects `qty is None` — zero and negative values pass through untouched at `catalog-service/app/services/orders.py:196-200`. A naive `SUM(qty)` could be understated, overstated, or misleading if such rows exist. This audit did **not** query the live data to check whether any zero/negative rows actually exist yet (that's a phase-2 data-quality task, not an architecture audit) — it only confirms the *code path* allows them.

## 5. ~40,000 unassigned legacy customers
Per migration `36869bd395d1`'s own docstring: every pre-existing customer (~40k real ERP rows) starts with `salesman_id IS NULL` on the ownership feature's introduction, because no source of truth existed for who sells to whom. These customers' orders are currently only committable by an admin. Any "customers per salesman" or "orders per salesman" metric must explicitly show an "unassigned" bucket rather than silently excluding these customers or attributing them to someone.

## 6. `RequestStatus.committed` is a phantom status
The enum defines `committed`, and several places in the code defensively check against it (queue's `DECIDED` set, review.py), but no row is ever actually written with that status — successful commits delete the row instead. Any analytics query filtering `pending_request.status = 'committed'` will always return zero rows; this must not be mistaken for "no requests have ever been committed."

## 7. AI quality data does not survive commit
`pending_request_line.match_confidence`, `.operator_edited`, and `.change` are the only AI-before/after signals, and they live on a row that is deleted at commit time. AI-quality analytics (confidence buckets, correction rates) can only be computed today over currently-open or terminally-rejected/callback requests — not over the (likely majority) of requests that were successfully accepted and committed. This is a significant limitation for the "AI Quality" page the master prompt requires (Phase 7) and should be flagged prominently on the Data Health page (Phase 9) rather than silently producing AI-quality numbers that only reflect the non-committed subset.

## 8. `GET /activity` has no per-user authorization
Documented in doc 04. Not a data-correctness limitation, but a trust/security limitation relevant if this endpoint is ever used as an analytics source: anyone with (or without, if unset) the shared api-key can read it today.

## 9. Free-text category, not normalized
`Item.category` is a plain string column. Category-based analytics will reflect exactly what's stored (including possible inconsistent capitalization/spelling across items) — no normalization or hierarchy exists to correct for that.
