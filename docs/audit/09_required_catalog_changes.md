# 09 — Required Catalog-Service Changes

> No financial data appears in this document. None of the changes below add price/revenue/amount fields.

Candidates for phase 2 — not implemented by this audit.

## 1. Commit-time salesman attribution
Add a column to `order_header`, populated once inside `create_order()` (`app/services/orders.py`, right after the ownership check at lines 174-186, using the already-resolved `acting_salesman_id`) and never updated afterward. This is the direct fix for the historical-attribution risk in doc 07 (option 1 there). Needs an Alembic migration; existing rows would have this column NULL (no way to backfill truthfully — must render as "unknown," not defaulted to current `Customer.salesman_id`, which would just recreate the exact bug being fixed).

## 2. Order date / commit timestamp
Add `order_header.committed_at` (server-default `now()` on insert), reintroducing a timestamp that was deliberately removed by migration `5910168e3bcc`. Unlike the original `created_at` this one is scoped for analytics from day one, so its purpose should be documented in the migration message to avoid a repeat of the ambiguity that led to the original column's removal (the original docstring implies the old `created_at` had become overloaded/misused for order-lookup logic that was later dropped along with it).

## 3. Request/voice lineage on the order
`commit_intent_id` already correlates a request to an order transiently. Making that link durable and queryable from the order side means either: (a) nothing changes here, and doc 08's fix (stop deleting `PendingRequest` on commit) is sufficient, since `commit_intent_id` already lives on both `order_header` and the historical `PendingRequest` row once it stops being deleted; or (b) if backend keeps deleting requests for storage reasons, add a minimal `order_header.source_request_id`/`source_voice_message_id` pointer here instead. Recommend (a) — it avoids a cross-service ID that has no FK integrity anyway (the two databases are separate), and reuses a mechanism that already exists.

## 4. Quantity validation
Add a DB `CheckConstraint("qty <> 0")` (or `qty > 0` if negative-for-returns is not a legitimate case — needs a decision from whoever owns the ERP semantics, this audit found no code path that intentionally produces negative qty) on `order_details`, plus a matching Pydantic `Field(gt=0)` on `LineIn`/`LineEditIn` (`app/schemas/models.py`) so bad input is rejected at the API boundary, not just silently persisted. This is the direct fix for doc 06 §4.

## 5. (Optional, lower priority) Category normalization
Not required for phase 1/2's stated goals, but noted since doc 02/06 flag `Item.category` as an unnormalized free-text column — if category-based analytics in phase 6 turn out to be noisy due to inconsistent values, a normalization pass (not necessarily a new table) may be worth a follow-up, outside this audit's scope.

## Explicitly NOT recommended by this audit
- Do not add a cross-service foreign key from `order_header` to `backend`'s `pending_request` — the two services deliberately use separate databases (see doc 01); any linkage should remain a plain indexed string/int column, matching the existing `cust_nb`/`salesman_id` pattern.
- Do not retroactively populate the new attribution/date columns for existing orders with fabricated values — leave them NULL and let the Data Health page (phase 9) report the resulting completeness percentage honestly.
