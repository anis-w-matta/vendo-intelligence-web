# 08 — Required Backend (`backend` repo) Changes

> No financial data appears in this document. None of the changes below add price/revenue/amount fields.

These are **candidates** for phase 2 to design and implement — this audit does not implement them. Listed in rough priority order based on which analytics gaps they close.

## 1. Preserve request/order lineage instead of deleting on commit
Today `OrderCommitService._finalize_committed()` (`app/services/commit.py`) calls `session.delete(req)` on success, destroying `PendingRequest`/`PendingLine` rows (including AI confidence, edit history, and timestamps) the instant an order commits. Options: (a) soft-delete — set `status="committed"` (the enum value already exists but is unused) and stop deleting, keeping the row queryable indefinitely; (b) archive — move the row (and lines) into a separate `committed_request_archive` table before deleting from the live table, keeping the operational `pending_request` table small while preserving history. Either closes the "AI quality on committed requests" and "request→order lineage" gaps from doc 06 in one change. Must also finally set `committed_order_nb` (already a dead field on the model) so the link to the resulting order is explicit rather than inferred from `activity_log`.

## 2. Document `PendingRequest.created_at`'s real meaning
No code change strictly required, but the field should get an inline comment (or be renamed in a future migration, e.g. `intake_at`) making explicit that it is draft/intake time, not an order date — to prevent a future contributor (or the new web app's own developers) from mislabeling it, which the master prompt explicitly warns against.

## 3. Validate `qty > 0` at intake / edit time
`PendingLine.qty` accepts any value including zero/negative from voice parsing or operator edits. Even though the authoritative quantity validation gap is really in catalog-service (doc 09), backend's own draft-building/edit path (`draft_builder.py`, `commit.py._apply_edits`) could reject non-positive quantities earlier, before they ever reach the commit call — cheaper to fix at the source than to filter after the fact everywhere analytics reads `qty`.

## 4. Fix `GET /activity` authorization
Not an analytics-data gap, but the new admin web app is a natural consumer of `activity_log`, and today that endpoint has no per-user auth dependency (doc 04 §Known gap). Add `Depends(get_current_salesman)` (and consider `require_admin`, since this is exactly the kind of cross-customer visibility that should be admin-only) before the Node BFF is built to depend on it.

## Explicitly NOT recommended by this audit
- Do not add a `RequestStatus.committed`-persisting change that *also* keeps deleting the row — that would just create the phantom-status problem in the other direction (a status nothing ever reads because the row is still gone).
- Do not backfill `committed_order_nb` for already-committed (already-deleted) historical requests — there is no way to reconstruct which order came from which now-deleted request beyond what `activity_log.details` may already contain, and guessing would violate the master prompt's "never fabricate... missing relationships" rule.
