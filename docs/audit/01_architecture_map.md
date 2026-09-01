# 01 — Architecture Map

> No financial data (price, revenue, amount, order value) appears anywhere in this document.

## Current system (as of this audit, 2026-09-01)

Three independent repositories, no shared database:

```
Android :app (salesman)  ─┐
Android :admin (admin)   ─┤
                          ▼
                  backend (FastAPI, Python)
                  - PendingRequest / PendingLine
                  - Salesman / ActivityLog / VoiceMessage
                  - JWT auth, request lifecycle, voice intake
                  - own Postgres schema
                          │
                          │  HTTP (catalog_client.py, X-API-Key)
                          ▼
                  catalog-service (FastAPI, Python)
                  - Customer / Item / OrderHeader / OrderDetail
                  - QraHeader / QraDetail (promo agreements)
                  - order commit, QRA evaluation
                  - own Postgres schema
```

- `backend` never touches catalog-service's tables directly; every cross-service read/write goes through `backend/app/services/catalog_client.py` over HTTP, authenticated with an optional `X-Api-Key` header.
- Each service has its own Alembic migration chain and its own Postgres schema/database. There is no cross-service foreign key anywhere (documented deliberately in code comments on both `Customer.salesman_id` and `OrderHeader.cust_nb`) — `Salesman` lives only in `backend`, `Customer`/`Item`/`Order*` live only in `catalog-service`.
- Android `:app` is the only client that can claim/accept/reject requests or commit orders. Android `:admin` is read-only for requests (per the master prompt's rule for the new web app too) and handles customer/salesman management (`PATCH /customers/{cust_nb}/salesman`, `PATCH /salesmen/{login_id}`).

## Voice → order pipeline (traced end to end)

```
Android :app records voice
        │
        ▼
POST /ingest/voice (backend)          VoiceMessage.status = received
        │
        ▼  worker.py background job
Gemini transcription                  VoiceMessage.status = transcribing → transcribed
        │
        ▼  app/pipeline.py IntakePipeline.process
Classification / scripted parse       VoiceMessage.status = drafted (or failed/too_long)
        │
        ▼  app/services/draft_builder.py
PendingRequest (status=new) + PendingLine rows created
        │
        ▼  POST /queue/{id}/claim
PendingRequest.status = in_review, assigned_to = claimant
        │
        ├─▶ POST /requests/{id}/reject   → status = rejected (terminal, row kept)
        ├─▶ POST /requests/{id}/callback → status = callback (row kept, re-claimable)
        │
        ▼  POST /requests/{id}/accept
OrderCommitService.commit() (backend/app/services/commit.py)
  1. status = committing, commit_intent_id generated, decided_at = now() (durable pre-write)
  2. catalog_client.create_order(...) → catalog-service POST /orders
        │
        ▼  catalog-service/app/services/orders.py create_order()
     resolve cust_nb (direct / RETURN target / reorder-by-order-nb)
     → check Customer exists → check ownership (acting_salesman_id vs Customer.salesman_id, current value only)
     → validate lines → apply QRA → allocate order_nb → persist OrderHeader + OrderDetail
        │
        ▼ success
  3. backend: session.delete(PendingRequest)  ← row is HARD-DELETED, not marked "committed"
     ActivityLog: event_type="order_committed" logged (id/cust_nb/order_nb only, PendingRequest data does not survive)
```

Crash recovery: `backend/app/worker.py reconcile_stuck_commits()` polls for requests stuck in `status="committing"` past a timeout and retries the same `create_order()` call idempotently via `commit_intent_id`.

## Where the new `vendo-intelligence-web` app plugs in

Per the master prompt's mandate:

```
React (vendo-intelligence-web/frontend)
        │  HTTP only, never SQL
        ▼
Node.js BFF (vendo-intelligence-web/backend)
        │                       │
        ▼ HTTP                 ▼ HTTP
   backend (FastAPI)     catalog-service (FastAPI)
        │                       │
        ▼                       ▼
   backend Postgres      catalog-service Postgres
```

- The Node BFF is a new, read-only aggregation layer. It calls the *existing* FastAPI services the same way Android does (or via new admin-only read endpoints added to those services if needed) — it does not get a direct Postgres connection of its own to either database, per the master prompt's explicit rule.
- No existing Android workflow, endpoint, or service is replaced or modified by this app's read path. Any backend/catalog-service changes this audit recommends (see docs 08/09) are additive (new columns/endpoints), not breaking changes to the request/order lifecycle Android depends on.
- The Node BFF must never implement claim/accept/reject/commit — those remain exclusively in `backend`'s existing endpoints, invoked only from Android `:app`.
