# 04 — Authentication / Authorization Map

> No financial data appears in this document.

## Authentication

- **Mechanism**: stateless JWT (HS256), `backend/app/services/auth.py`. `create_token(login_id)` embeds `{sub, iat, exp}`; `jwt_expire_minutes` = 20160 (14 days). `jwt_secret` has no default — must be configured per deployment.
- **Password storage**: bcrypt (`hash_password`/`verify_password`).
- **Login**: `POST /auth/login` looks up `Salesman` by `login_id`, checks `is_active` and password, returns a generic 401 for both "no such id" and "wrong password" (deliberate, to prevent login-id enumeration).
- **Enforcement pattern**: per-route dependency injection (`Depends(get_current_salesman)` in `app/api/deps.py`), **not** global middleware. Each router opts in individually. `get_current_salesman()` reads `Authorization: Bearer <token>`, decodes it, loads the `Salesman` row, and 401s if it doesn't exist or `is_active=False`.
- **Separate shared-secret gate**: `require_api_key` (`X-Api-Key` header, `secrets.compare_digest`) is applied at router-mount level in `app/main.py` to every router. It is off by default (`api_key: str | None = None` in config) — deployments that haven't set it have no api-key gate at all, only per-route JWT.
- **catalog-service** has no per-user identity of its own — it trusts `backend` entirely (also gated by its own optional `X-Api-Key`). Every write call from `backend` passes `acting_salesman_id`/`acting_is_admin` as explicit parameters, always derived server-side from the authenticated `backend` caller's own JWT-verified session, never from an untrusted client field.

### Known gap
`GET /activity` (`backend/app/api/activity.py`) has **no** `get_current_salesman` dependency — only the optional api-key gate protects it. Any caller with (or without, if api-key is unset) the shared secret can read the full activity log across all salesmen/customers. This is a pre-existing gap noted in project memory; fixing it is out of scope for this audit (it's a backend bug, not an analytics-data problem), but the new web app **must not** rely on `/activity` as an audit trail without first confirming this is fixed, since it currently has no authorization boundary at all.

## Authorization

Two layers, by design (`backend/app/services/authorization.py` docstring is explicit about this split):

1. **Read-side ownership** (`owns_customer()` / `require_customer_ownership()`, `backend/app/services/authorization.py`): `True` unconditionally for admins or when `cust_nb is None`; otherwise fetches the customer's *current* `salesman_id` from catalog-service and compares to the requesting salesman's `login_id`. Used by: `GET /queue`, `GET /queue/{id}`, `POST /queue/{id}/claim`, `POST /requests/{id}/reject`, `POST /requests/{id}/callback`, `GET /customers/{cust_nb}` (403, not 404, on mismatch).
2. **Write-side, authoritative** (`catalog-service/app/services/orders.py create_order()`): runs *after* `cust_nb` is fully resolved (RETURN/reorder-by-order-number can resolve to a different customer than the one named in the request), comparing `acting_salesman_id` against the resolved customer's current `salesman_id`. `acting_is_admin=True` bypasses this entirely. This is the only check that actually gates whether an order can be committed for a customer.

`require_admin` (`backend/app/api/deps.py`) is a separate route-level dependency (`salesman.is_admin`), used on: `POST /auth/register`, `PATCH /salesmen/{login_id}`, `GET /salesmen`, `PATCH /customers/{cust_nb}/salesman`.

### Ownership is always evaluated against *current* state
Neither layer above ever consults a historical/point-in-time value — `Customer.salesman_id` is a single mutable column with no history table. This is the same root cause behind the historical-attribution gap in doc 07: authorization correctly gates *future* actions against current ownership (that's the right behavior — you can't act on behalf of a customer you no longer own), but nothing preserves *who owned the customer at the time a past order was placed*, which is what analytics needs and authorization does not.

## Implication for the Node.js BFF and React app

- The Node BFF must independently enforce admin-only access server-side for every `/api/admin/intelligence/*` endpoint (reusing the existing JWT + `require_admin` pattern by validating the same tokens, or by calling `GET /auth/me` through to `backend`) — the master prompt is explicit that "the UI alone must never determine authorization," and the existing system already demonstrates the right pattern (per-route dependency, not middleware-only, not client-trusted).
- The React app has no legitimate reason to call `/activity` until the missing-auth gap above is fixed or otherwise mitigated (e.g., only ever proxied through an already-admin-gated Node BFF route, never exposed as a pass-through).
