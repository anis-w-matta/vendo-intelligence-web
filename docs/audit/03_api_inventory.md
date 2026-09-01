# 03 — API Inventory

> No financial data (price, revenue, amount, order value) appears anywhere in this document, and none of the listed endpoints return financial fields.

Both services mount every router behind an optional shared-secret gate (`require_api_key`, `X-Api-Key` header, off unless `settings.api_key` is configured). Per-user auth (`get_current_salesman` / `require_admin`) is applied per-route, not globally — see doc 04 for the full auth model.

## backend (`http://127.0.0.1:8000` by default)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/login` | api-key only | |
| POST | `/auth/register` | api-key + admin | |
| PATCH | `/salesmen/{login_id}` | api-key + admin | activate/deactivate only |
| GET | `/auth/me` | api-key + salesman | |
| PATCH | `/auth/me` | api-key + salesman | |
| POST | `/auth/change-password` | api-key + salesman | |
| GET | `/queue` | api-key + salesman | ownership-filtered for non-admins |
| GET | `/queue/{req_id}` | api-key + salesman | ownership-checked |
| POST | `/queue/{req_id}/claim` | api-key + salesman | ownership-checked |
| GET | `/audio/{voice_id}` | api-key only | no per-user check — Android MediaPlayer can't send a bearer token |
| POST | `/requests/{req_id}/accept` | api-key + salesman | commits order via catalog-service |
| POST | `/requests/{req_id}/reject` | api-key + salesman | ownership-checked |
| POST | `/requests/{req_id}/callback` | api-key + salesman | ownership-checked |
| GET | `/activity` | api-key only | **no per-user auth dependency** — pre-existing gap, not in this audit's scope to fix |
| GET | `/customers/search` | api-key + salesman | |
| GET | `/customers/all` | api-key + salesman | |
| GET | `/customers/{cust_nb}` | api-key + salesman | ownership-checked, 403 (not 404) if not owner |
| GET | `/salesmen` | api-key + admin | supports `include_inactive` |
| PATCH | `/customers/{cust_nb}/salesman` | api-key + admin | reassigns ownership |
| POST | `/ingest/voice` | api-key only | 202 Accepted, async pipeline |
| POST | `/ingest/transcribe-preview` | api-key only | |
| GET | `/ingest/voice/{voice_id}` | api-key only | |
| GET | `/items/search` | api-key + salesman | proxies catalog-service |
| GET | `/items/all` | api-key + salesman | proxies catalog-service |
| GET | `/orders/recent` | api-key + salesman | proxies catalog-service, ownership-filtered |
| GET | `/qra/all` | api-key + salesman | proxies catalog-service |
| GET | `/health` | none | |
| GET | `/console` | none | static reviewer console, stale/pre-JWT (see memory) |
| GET | `/record` | none | |

## catalog-service (`http://127.0.0.1:8100` by default)

All endpoints below require `require_api_key` only — catalog-service has no per-user identity concept of its own; every write endpoint takes `acting_salesman_id`/`acting_is_admin` as caller-supplied trusted parameters (only `backend` calls this service, and only with server-derived values — see doc 04).

| Method | Path | Notes |
|---|---|---|
| GET | `/items/resolve` | |
| GET | `/items/search` | |
| GET | `/items/all` | |
| GET | `/items/by-numbers` | |
| GET | `/customers/by-numbers` | |
| GET | `/customers/match` | |
| GET | `/customers/search` | |
| GET | `/customers/all` | |
| GET | `/customers/{cust_nb}` | |
| PATCH | `/customers/{cust_nb}/salesman` | sets `Customer.salesman_id`; caller (backend) already enforced admin-only |
| GET | `/qra/all` | |
| POST | `/qra/preview` | non-mutating preview of QRA effects on a draft line set |
| GET | `/orders/recent` | filterable by customer ownership (via join) |
| GET | `/orders/{order_nb}/{order_type}` | |
| GET | `/orders/by-so-nb/{ref}` | |
| POST | `/orders/resolve-target` | resolves RETURN/reorder targets |
| POST | `/orders` | order commit — the only write path into `order_header`/`order_details` |
| GET | `/health` | no auth |

## Implication for the Node.js BFF (phase 3)

Every mandatory analytics endpoint the master prompt lists (`/api/admin/intelligence/*`) will need to be built as a *new* layer that calls the above endpoints (or new admin-only aggregation endpoints added to these two services, if per-row fetching proves too slow — see doc 10) — there is currently no existing endpoint in either service that returns pre-aggregated analytics. All existing endpoints return per-row or per-request data shaped for the Android apps, not for dashboards.
