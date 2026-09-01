# 07 — Historical Ownership / Attribution Risks

> No financial data appears in this document.

## The concrete risk

`Customer.salesman_id` is a single mutable column with no history. Every query that reports "this order/customer belongs to salesman X" — including `GET /orders/recent`'s join and `authorization.owns_customer()` — reads this column's **current** value, at query time, regardless of when the order was actually placed.

**Worked example**:
1. Customer `58466` is owned by Salesman A. Salesman A sells them 20 orders over 6 months.
2. Customer `58466` is reassigned to Salesman B (via `PATCH /customers/{cust_nb}/salesman`).
3. Any dashboard query run *after* step 2 — "orders per salesman," "customer portfolio," "top customers by order count for Salesman A" — will now attribute all 20 historical orders to Salesman B, and show zero for Salesman A, even though Salesman A actually did the work. This is silent and would look like correct, confident data; nothing in the current system flags it as suspect.

This directly violates the master prompt's own "Historical ownership" rule: *"Current `Customer.salesman_id` must not automatically rewrite historical attribution after customer reassignment. Implement or consume an authoritative historical attribution mechanism."* Today, no such mechanism exists — this rule is currently being violated by construction, simply because there is nothing else to query.

## Why this matters for phase 1 specifically

This audit does not pick a fix (that's phase 2's job, and the master prompt is explicit that metric definitions must be validated before analytics code is written). It exists to make sure phase 2 doesn't miss the requirement or underestimate it: **every mandatory salesman-scoped metric in the master prompt** (orders per salesman, item quantity per salesman, customer portfolio per salesman, rejection rate by salesman, salesman detail trends) is affected by this gap the moment any customer is ever reassigned.

## Candidate approaches for phase 2 (not decided here)

1. **Order-time attribution column**: add `order_header.salesman_id_at_commit`, populated once at commit time from the customer's `salesman_id` at that moment, never updated afterward. Simplest to query (no join/point-in-time logic needed), but only covers orders committed *after* the column is added — pre-existing orders would need a one-time backfill using whatever attribution can be reconstructed (possibly none, for legacy ERP-imported orders — see doc 06 §5).
2. **Customer ownership history table**: a new `customer_ownership_history(cust_nb, salesman_id, effective_from, effective_to)` table, populated on every reassignment. Answers "who owned this customer on date D" for any D, which is more general (also useful outside orders), but requires point-in-time joins in every historical query and a migration to seed an initial history row for every existing customer.
3. **Do nothing yet, label instead**: until phase 2, any UI element ostensibly showing "orders by salesman" for historical/trend data must clearly label the number as reflecting *current* ownership, not who actually sold it — this is the honest fallback the non-financial rule's broader "data honesty" principle demands ("Unknown must remain unknown"), but it is not a real fix and should not be treated as the final answer.

Phase 2 must choose one of these (or an equivalent) before any salesman-scoped historical metric is built with confidence; this audit's job is only to make the tradeoff and its urgency explicit.

## Secondary, related gap: no order-request lineage or order date

Compounding the above, doc 06 §2–3 note there's also no durable order date or request→order lineage. A full historical-attribution fix in phase 2 should be designed alongside those two, since a `salesman_id_at_commit` column and an `order_date`/`committed_at` column are both most naturally added to `order_header` at the same commit-time write path (`catalog-service/app/services/orders.py create_order()`), and reviewers should not have to reopen that code path twice.
