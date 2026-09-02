# Phase 17 Certification — VeNdO Intelligence

Date: 2026-09-02
Scope: validation and certification of the already-built read-only admin
analytics web app (Phases 1–16). This phase adds no new UI. It runs the
existing test suites for a real baseline, closes two specific timezone
bugs, verifies (and where genuinely missing, adds) required test
coverage, performs a static security/isolation audit, and produces this
report. Every verdict below is backed by a command that was actually run,
a file:line citation, or a named test — nothing here is asserted without
evidence.

Repos touched: `vendo-intelligence-web` (this worktree, branch
`phase17-certification`), `backend` (Python FastAPI, own git history),
`catalog-service` (Python FastAPI, own git history). `android` was not
touched — see the Android item below.

---

## Part 1 — Baseline (before any Phase 17 change)

| Suite | Command | Result |
|---|---|---|
| `catalog-service` | `.venv\Scripts\python.exe -m pytest -q` | **37 passed** |
| `backend` (Python) | `.venv\Scripts\python.exe -m pytest -q` | **57 passed** |
| `vendo-intelligence-web/backend` | `npm test` | **173 passed** (8 files) |
| `vendo-intelligence-web/backend` | `npx tsc --noEmit -p tsconfig.json` | clean, exit 0 |
| `vendo-intelligence-web/frontend` | `npm test` | **132 passed** (13 files) |
| `vendo-intelligence-web/frontend` | `npx tsc -b` | clean, exit 0 |
| `vendo-intelligence-web/frontend` | `npm run build` | succeeds (one non-blocking chunk-size warning, 643 KB main bundle) |

No regressions found. Baseline was fully green before any Phase 17 work began.

## Final test counts (after all Phase 17 changes)

| Suite | Before | After | Delta |
|---|---|---|---|
| `catalog-service` | 37 | **38** | +1 (UTC day-boundary test for `orders_trend`) |
| `backend` (Python) | 57 | **63** | +6 (2 timezone-boundary tests + 4 request-lifecycle tests) |
| `vendo-intelligence-web/backend` | 173 | **178** | +5 (1 Gemini 429 test + 4 upstream-unavailable route tests) |
| `vendo-intelligence-web/frontend` | 132 | **132** | +0 (no gap found — golden dataset and attribution tests already existed on the Python side) |

All four suites, plus both `tsc` checks and the production build, were
re-run after every change and are green as of this report.

---

## Part 2 — Timezone bug fixes

### Bug 1 (the one flagged in advance): `volume_over_time()`

**File**: `backend/app/services/analytics.py`, `volume_over_time()` (was
line 212). Used `func.date_trunc("day", PendingRequest.created_at)` with
no UTC conversion. This service's Postgres session defaults to
`Europe/Chisinau` (confirmed live: `SHOW timezone` → `Europe/Chisinau`,
`SELECT now()` → `...+03:00`, currently EEST/UTC+3), so
`date_trunc('day', a timestamptz)` silently bucketed by local calendar
day, not real UTC midnight — exactly the class of bug already fixed in
this same file's `activity_by_hour`/`activity_volume_over_time`
(Phase 10, `func.timezone("UTC", ...)` pattern).

**Fix**: `func.date_trunc("day", func.timezone("UTC", PendingRequest.created_at))`
plus a docstring note matching the existing convention.

**Evidence it was a real bug, not just a style fix**: new test
`TestVolumeOverTime.test_buckets_by_utc_day_not_session_timezone`
(`backend/tests/test_analytics.py`) constructs two requests 30 minutes
apart in UTC, straddling the UTC day boundary (`23:45` and `00:15`).
Verified by temporarily reverting the fix (`git stash` on
`analytics.py` only) and re-running: the test **failed** —
`{datetime.date(2026, 3, 2): 2}` (both rows collapsed into the wrong,
Chisinau-local day) instead of one row per correct UTC day. With the fix
restored, it passes.

### Bug 2 (found during the broader audit): `ai_quality_trend()`

**File**: `backend/app/services/analytics.py`, `ai_quality_trend()` (was
line 401). Same unwrapped `func.date_trunc("month", PendingRequest.created_at)`
pattern, one month-bucket wrap instead of a day-bucket one — same root
cause, same session timezone.

**Fix**: wrapped in `func.timezone("UTC", ...)`, docstring note added.

**Evidence**: new test
`TestAiQuality.test_trend_buckets_by_utc_month_not_session_timezone` uses
a timestamp late on the last UTC day of January (`2026-01-31T23:00Z`,
which is already February in Chisinau local time) — confirmed to fail
without the fix (`KeyError: '2026-01'`, the row landed in `"2026-02"`
instead) and pass with it.

### Bug 3 (found in `catalog-service`): `orders_trend()`

**File**: `catalog-service/app/services/analytics.py`, `orders_trend()`
(was line 290). Same pattern:
`func.to_char(func.date_trunc(granularity, sub.c.committed_at), ...)`
with no UTC wrap, for both `"day"` and `"month"` granularity. Confirmed
`catalog-service`'s own Postgres session also defaults to
`Europe/Chisinau` (`SHOW timezone` on its own connection). This function
backs the Command Center fleet trend, per-salesman/customer trend
charts, and Phase 12's anomaly-detection daily baselines — a day-bucket
shift here would misattribute orders near midnight to the wrong day in
every one of those.

**Fix**: `func.date_trunc(granularity, func.timezone("UTC", sub.c.committed_at))`,
docstring note added citing the same class of bug already fixed
elsewhere.

**Evidence**: new test
`TestOrdersTrend.test_day_bucket_boundary_is_utc_not_session_timezone`
(`catalog-service/tests/test_analytics.py`) — two orders committed 30
minutes apart in UTC (`2026-01-15T23:45Z` / `2026-01-16T00:15Z`).
Confirmed to fail without the fix (`KeyError: '2026-01-15'`) and pass
with it.

### Audited and found already safe (no change made)

- `backend/app/services/analytics.py`, `turnaround_summary()` (line
  ~146): `func.extract("epoch", PendingRequest.decided_at - PendingRequest.created_at)`.
  `EXTRACT(EPOCH FROM interval)` is a duration in seconds between two
  `timestamptz` values — timezone-independent by construction (the
  session timezone only affects how a timestamp is *displayed/bucketed*,
  not the interval arithmetic between two of them). No fix needed.
- `backend/app/services/analytics.py`, `activity_by_hour()` and
  `activity_volume_over_time()` (Phase 10): already fixed in a prior
  session with the exact `func.timezone("UTC", ...)` pattern this phase
  reused. Re-verified still correct and still passing.
- No other `date_trunc`/`func.extract`/`to_char`/`::date` usage exists
  in either Python service (confirmed by grep across both `app/`
  trees) — these three were the only genuine instances of this bug
  class.

### Regression check

Both Python suites were re-run in full after all three fixes: no
existing test broke (i.e. no other test had baked in an assumption of
the old, wrong bucketing), so no test *expectations* needed correcting —
only new coverage was added.

---

## Part 3 — Required test verification

### Golden dataset (1 order, 3 lines, qty 10+20+5 → Orders=1, Lines=3, Quantity=35)

**Already existed, exactly as specified.**
`catalog-service/tests/test_analytics.py::TestOrdersSummary::test_worked_example`
(lines 32–41):
```python
_order(db_session, "A0001", customer.customer_number,
      lines=[(1, "I1", "10", "EACH"), (2, "I2", "20", "EACH"),
            (3, "I3", "5", "EACH")])
r = analytics.orders_summary(...)
assert r.order_count == 1
assert r.order_line_count == 3
assert r.item_quantity == Decimal("35")
```
No new test added.

### Historical ownership (customer owned by A, then reassigned to B — orders committed during A's period must never attribute to B)

**Already existed, on both sides of the metric.**
- `catalog-service/tests/test_analytics.py::TestSalesmenOrderMetrics::test_attributes_by_ownership_at_commit_time_not_current_owner`
- `catalog-service/tests/test_analytics.py::TestOrdersTrend::test_attributes_by_ownership_at_commit_time`

Both build `CustomerOwnershipHistory` rows directly with an exact
`effective_from`/`effective_to` boundary and assert an order committed
in A's window attributes to A even after B takes over. No new test
added.

### Request lifecycle reconciliation (Created → Claimed → Accepted/Rejected → Committed)

**Real gap found — closed.** Neither `test_queue_review.py` (doesn't
exist) nor any existing file exercised `claim()`
(`app/api/queue.py`) and `accept()`/`reject()` (`app/api/review.py`)
against the *same* request as one sequence:
- `tests/test_commit.py` tests `OrderCommitService.commit()` starting
  directly from `status="new"`, skipping the claim step entirely.
- `tests/test_authorization.py` tests only the `owns_customer()` gate
  function in isolation, never the route handlers.

Added `backend/tests/test_request_lifecycle.py` (new file, 4 tests),
calling the actual route handler functions directly (same
zero-`TestClient` style already used throughout this suite —
confirmed no `TestClient` import exists anywhere in the suite):
1. `test_created_claimed_accepted_committed` — New → `queue.claim()` →
   `in_review` (asserts `assigned_to`/`claimed_at` set) → `review.accept()`
   (catalog_client.create_order mocked, same pattern as test_commit.py)
   → `committed`, `committed_order_nb` set.
2. `test_created_claimed_rejected` — New → Claimed → `review.reject()` →
   `rejected`, `decided_by`/`decided_at`/`decision_note` set.
3. `test_claim_then_reject_by_a_second_reviewer_is_rejected` — proves the
   409 "claimed by X" guard holds even for a second, legitimately
   authorized reviewer.
4. `test_already_decided_request_cannot_be_rejected_again` — proves the
   `AlreadyDecided` guard (409) prevents a second decision from
   overwriting `decided_at`/`decision_note`.

### Gemini failure modes

**Mostly already covered; one specific gap closed.**
`vendo-intelligence-web/backend/test/geminiClient.spec.ts` already
tested: missing API key, non-200 generically (503), network error,
timeout/abort, empty response, no-candidates response, malformed JSON,
improbably-long/malformed text. `ask.spec.ts` and `geminiExplain.spec.ts`
already test the route-level "Gemini errors → typed unavailable, still
HTTP 200, never throws" degradation generically.

**Gap**: no test used HTTP 429 specifically (Gemini's actual rate-limit
status), only a generic 503 non-200 case. Added
`geminiClient.spec.ts::"produces an unavailable result without throwing on a 429 rate-limit response"`
— mocks a `429 RESOURCE_EXHAUSTED` response and confirms
`result.status === "unavailable"`, never a throw. 12 → 13 tests in that
file.

### Upstream-service-unavailable handling

**Real gap found — closed.** `handleUpstreamError`
(`backend/src/lib/errors.ts`) and `UpstreamError`
(`backend/src/lib/httpClient.ts`) are the mechanism every route wraps
its `backendClient`/`catalogClient` calls in (confirmed via grep: all 15
route files import and use `handleUpstreamError` in a `try/catch`), but
`routes.spec.ts`'s shared `mockAllClients()` always resolves
successfully — no existing test ever drove a route through this path.

Added `vendo-intelligence-web/backend/test/upstreamUnavailable.spec.ts`
(new file, 4 tests) covering three representative routes, one per
upstream and one for the negative case:
1. `GET /salesmen` — Python backend network error (`UpstreamError`,
   `status: "network"`) → clean `503`, `error` mentions `backend`.
2. `GET /orders` — catalog-service non-200 (`UpstreamError`, `status: 500`)
   → clean `503`, `error` mentions `catalog-service`.
3. `GET /overview` — a backend call failing mid-aggregation → `503`, not
   `500`, not a fabricated `200`.
4. Negative control: a **non**-`UpstreamError` thrown by an upstream call
   is correctly *not* swallowed as a fake `503` — `handleUpstreamError`
   re-throws it and Fastify turns it into a genuine `500`, proving real
   bugs aren't hidden behind the "unavailable" response an operator would
   read as transient/not-our-fault.

---

## Part 4 — Static security/isolation audit

### Operational isolation — VERIFIED

`grep`'d every HTTP call site in `backend/src/lib/backendClient.ts` and
`catalogClient.ts`: every single one goes through `getJson()`
(`httpClient.ts`), which issues only `fetch(url, { headers })` — no
`method`, no body, GET only. Zero `POST`/`PUT`/`PATCH`/`DELETE` call
sites exist in either file. The only `POST` anywhere in this BFF's `lib`
is `geminiClient.ts`'s call to Gemini's own `generateContent` REST
endpoint (`method: "POST"`, line 201) — an outbound call to Gemini, not
to the operational system. The BFF's own `/ask` and
`/insights/explain` endpoints (`routes/ask.ts`, `routes/geminiExplain.ts`)
call only `backendClient`/`catalogClient` (read) and `geminiClient`
(Gemini) functions.

**Conclusion, stated plainly**: this BFF has no code path that could
claim, accept, reject, edit, or commit anything in the operational
system. It is structurally read-only.

### Admin authorization on every route — VERIFIED

`grep`'d every file in `vendo-intelligence-web/backend/src/routes/`
(15 files) for `requireAdmin`: every one imports it and registers it as
`{ preHandler: requireAdmin }` on every route it defines. `server.ts`
registers exactly one unauthenticated route, `GET /health` (line 30),
plus the 15 route modules — no other route registration exists.

### Secret handling — VERIFIED

`GEMINI_API_KEY`/`BACKEND_API_KEY`/`CATALOG_API_KEY` are read only in
`src/config.ts` and consumed in `backendClient.ts`, `catalogClient.ts`,
`geminiClient.ts`. Grepped all four files for `console.log`/`.log(` near
those reads: no matches. Fastify is built with `Fastify({ logger: true })`
(`server.ts:22`), which uses pino's default request serializer — the
live baseline test run's captured log lines confirm this logs only
`method`/`url`/`host`/`remoteAddress`, never headers (so no
`Authorization`/`X-Api-Key` ever hits the log stream). No route returns
`apiKey`/`geminiApiKey`/`backendApiKey`/`catalogApiKey` in any response
body (grepped route handlers' response-shaping code — these values never
leave `config.ts`'s consumers).

### CORS posture — DOCUMENTED, NOT CHANGED (per instruction)

`vendo-intelligence-web/backend/src/server.ts:28`:
`app.register(cors, { origin: true })` — reflects any origin.
`backend/app/main.py:24`: `CORSMiddleware(allow_origins=["*"])`. Both
confirmed live in the code (not from memory). This is a deliberate,
documented dev-parity posture between the BFF and the existing Python
backend, left unchanged per this phase's instructions.

**Disclosed limitation**: a real production deployment should tighten
both to an actual allowed-origins list before going live. This was not
fixed here — it's a genuine, real limitation being disclosed, not
silently patched.

### Session expiration — VERIFIED

- **Python backend JWT**: `create_token()` (`app/services/auth.py:22-29`)
  sets `exp = now + timedelta(minutes=settings.jwt_expire_minutes)`,
  where `jwt_expire_minutes: int = 20160` (`app/config.py`) — **14 days**,
  matching `docs/audit/04_auth_map.md`. `decode_token()`'s own docstring
  states `jwt.ExpiredSignatureError` is a subclass of
  `jwt.InvalidTokenError` (PyJWT's actual exception hierarchy), and
  `get_current_salesman()` (`app/api/deps.py:51-54`) catches
  `jwt.InvalidTokenError` generically, returning
  `401 "invalid or expired token"` for either case — same code path, same
  response, whether the token is malformed or genuinely expired. Existing
  tests (`tests/test_deps_auth.py::TestGetCurrentSalesman`) cover missing
  header, non-bearer scheme, a garbage/malformed token, and an inactive
  salesman, all asserting `401` — all exercise the identical `except
  jwt.InvalidTokenError` branch a real expired token would hit. No test
  constructs a literally-expired-but-well-formed token; given the
  provably shared exception branch, this was not treated as a gap
  requiring a new test (Part 4 is a read-only audit, not a
  fix-everything pass), but is noted here for completeness.
- **BFF `requireAdmin`** (`backend/src/plugins/auth.ts`): a **5-second**
  in-memory identity cache (`CACHE_TTL_MS = 5_000`, line 19) — short
  enough that a revoked session is re-checked against the Python
  backend's own `GET /auth/me` within 5 seconds, long enough to absorb a
  burst of requests from one page load. On any `UpstreamError` with a
  real HTTP status (i.e. the Python backend itself rejected the token),
  it returns `401`; on a network failure reaching the Python backend, it
  fails **closed** (`503`, not letting the request through) — "the UI
  alone must never determine authorization" is enforced even when the
  identity check itself can't be performed. `routes.spec.ts` covers the
  no-bearer-token → 401 case for every route (`it.each(ROUTES)`).

---

## Certification checklist

| Item | Verdict | Evidence |
|---|---|---|
| No financial analytics | **Verified** | `routes.spec.ts`'s `it.each(ROUTES)("... never mentions a forbidden financial field")` scans every route's response for `revenue`/`price`/`amount`/`order_value` markers; both Python `analytics.py` module docstrings state and structurally uphold "never computes or returns a price/revenue/amount field" (no such column is ever selected). |
| Correct order/line/quantity counts (golden dataset) | **Verified** | `catalog-service/tests/test_analytics.py::TestOrdersSummary::test_worked_example` (see Part 3). |
| Correct historical attribution | **Verified** | `TestSalesmenOrderMetrics::test_attributes_by_ownership_at_commit_time_not_current_owner`, `TestOrdersTrend::test_attributes_by_ownership_at_commit_time` (see Part 3). |
| Visible data limitations | **Verified** | Every summary DTO carries explicit completeness/exclusion fields (`orders_excluded_missing_commit_date`, AI-quality's documented under-representation of committed requests, etc.) rather than silently omitting affected rows — confirmed by reading the relevant dataclasses/docstrings in both `analytics.py` files. |
| Reliable lineage | **Limitation (on record)** | `docs/audit/06_data_limitations.md` item 3: no order↔request lineage survives past commit (`pending_request` is hard-deleted). Not fixed this phase — architectural, out of scope. |
| Correct turnaround | **Verified** | `turnaround_summary()`'s `EXTRACT(EPOCH FROM interval)` is timezone-safe by construction (see Part 2's "audited and found already safe"); `TestTurnaround` in `backend/tests/test_analytics.py` covers percentile computation over decided requests and the empty-sample case. |
| True histogram | **Gap (on record, confirmed still true)** | `HistogramChart.tsx`'s own comment: "A true histogram (server-computed, fixed-width buckets ... never a client-side binning)" is used for backlog-age and volume/hour on the Operations page, but the Turnaround section (`OperationsPage.tsx`) shows only median/P90 KPI numbers, never a binned duration histogram — confirmed by reading the page: no `HistogramChart` call references `turnaround`. This is the same Phase 10-declared gap, not silently closed. |
| Salesman 360 | **Verified present** | `GET /salesmen/:id` route + `salesmanDetail.ts`, exercised by `routes.spec.ts` and dedicated fixtures; 200 in the baseline route sweep. |
| Customer 360 | **Verified present** | `GET /customers/:id`, `customerDetail.ts`/`customerActivity.ts`, `customerDetail.spec.ts` (4 tests) including activity-state/interval-stats/signals/top-items/order-trend from real order history. |
| Item Intelligence | **Verified present** | `GET /items`, `GET /items/:id`, `categories.ts`; exercised in the route sweep. |
| Operations | **Verified present** | `operations.ts` (backlog, turnaround, rejection, request funnel, activity by hour/event-type/day) — see turnaround-histogram caveat above. |
| AI Quality | **Verified present, with a documented, structural completeness gap** | `aiQuality.ts`/`ai_quality_*` functions; `backend/app/services/analytics.py` lines 239–256's module docstring: no per-line before/after AI prediction exists in the schema, and AI-quality signals are lost at commit time for anything committed before Phase 2's `_finalize_committed` change — surfaced as an explicit completeness note, not hidden. |
| Operations/anomalies | **Verified present** | Phase 12 anomaly engine (`overview.ts`'s Attention Center), exercised by `routes.spec.ts`'s "runs the real Phase 12 engine and stays honest when quiet" test plus `frontend/src/lib/anomalyBaseline.test.ts` (18 tests). |
| Insights | **Verified present, with a documented scope limit** | `insights.ts`/`insightEngine.ts`; item-quantity-trend signals are explicitly scoped to a bounded top-N items list (`insightEngine.ts:337-339`, `insights.ts`'s `TOP_ITEM_LIMIT`) — "never looped over the full catalogue," by the code's own comment. |
| Safe Gemini | **Verified** | `geminiClient.ts`'s `SAFETY_INSTRUCTIONS` sent on every call (tested); full failure-mode matrix now includes 429 (Part 3); never throws, always degrades to a typed `unavailable` result. |
| Natural language analytics | **Verified present** | `ask.ts`/`askEngine.ts`, `askEngine.spec.ts` (21 tests), `ask.spec.ts`, `AskPage.test.tsx` (7 tests). |
| Data Health | **Verified present** | `dataHealth.ts`, `catalog-service`'s `data_health()` (structural + real checks, `duplicate_order_groups` heuristic documented — see Known Limitations). |
| Server-side admin authorization | **Verified** | Part 4: every route (except `/health`) registers `requireAdmin`; fails closed on upstream-unreachable; JWT/cache expiry both confirmed. |
| Android behavior unaffected | **Verified** | `git status --short` in `C:\vendo-app\android` returns empty (clean tree); `git log -5` shows only pre-existing history (`35ea119`, `70cc8bf`, ...), nothing from this session. `android/` was never opened or edited during this phase. |
| No direct PostgreSQL access from React | **Verified** | Grepped `frontend/src` for `pg`/`postgres`/`Pool`/`psycopg`/`sequelize`/`prisma`/`mysql`/`mongodb`/connection-string patterns: no matches. The frontend only calls the BFF over `fetch`. |
| Metric definitions and tests complete | **Verified, with disclosed scope limits** | Every analytics function in both Python services carries a docstring defining its exact semantics (join timing, exclusions, rounding); test coverage confirmed substantial and, after this phase, closes the lifecycle/upstream-failure/429/timezone-boundary gaps found. Remaining scope limits are listed in Known Limitations below, not silently absent. |
| Works without Gemini | **Verified by design, re-confirmed** | Every Gemini-dependent route degrades to a typed `unavailable` result at `HTTP 200` (never throws) — `geminiClient.spec.ts` (13 tests, now including 429), `ask.spec.ts`/`geminiExplain.spec.ts`'s "degrades to a typed unavailable result... never throwing" tests. |
| Production-ready | **Honest overall verdict: ready for controlled/internal admin use, not yet hardened for public production** | See below. |

### Production-readiness — honest overall verdict

The application is **functionally complete and correctly isolated**: it
cannot write to the operational system (Part 4), every route requires
verified admin identity, it degrades gracefully with Gemini absent or
failing, and its core metric definitions (orders/lines/quantity,
historical attribution, AI-quality scope) are precisely defined and
tested — including three real timezone bugs found and fixed this phase.

It is **not** yet hardened for unrestricted public production
deployment, for reasons already on record and not papered over here:

1. **CORS reflects any origin** (`origin: true` / `allow_origins=["*"]`)
   on both the BFF and the Python backend — fine for a controlled
   internal deployment, a real gap for a public-facing one.
2. **No true turnaround histogram** — median/P90 KPI numbers exist;
   a binned duration histogram does not (Phase 10's own declared gap,
   confirmed still true).
3. **AI-quality data does not survive commit** for the (likely
   majority of) requests that were successfully accepted — a schema
   limitation, not a bug, but a real completeness ceiling on the AI
   Quality page.
4. **Insights' item-quantity-trend signals are scoped to a bounded
   top-N list**, not the full catalogue.
5. **`duplicate_order_groups` is a deliberately narrow heuristic**
   (same `cust_nb` + to-the-second `committed_at`) that under-counts by
   design rather than risk false positives.
6. **No fleet-wide "active/inactive customer count"** exists — activity-
   state classification (`customerActivity.ts`) is computed per-customer
   on the Customer 360 detail page only, never aggregated across the
   whole customer base.
7. No literal expired-JWT test exists (though the code path is provably
   identical to the tested malformed-token case — see Part 4).

None of these block a controlled internal rollout to VeNdO's own admin
team. All of them should be resolved or explicitly re-accepted before
any wider/public exposure.

---

## Known Limitations (aggregated)

This section is intentionally the most complete in the document — every
honest, on-the-record gap across this whole project, plus what this
phase found new.

**Already on record (verified still true, not silently fixed):**
- No correction taxonomy (item vs. quantity vs. UOM vs. intent) —
  `PendingLine` only stores a binary edited/not-edited flag, never a
  distinct predicted-vs-final snapshot (`backend/app/services/analytics.py:239-256`).
- No true turnaround histogram — only median/P90/etc. summary
  statistics, confirmed above.
- Insights' item-signal detection scoped to a bounded top-N items list,
  never the full catalogue (`insightEngine.ts:337-339`).
- CORS reflects any origin on both the BFF and the Python backend —
  deliberate dev-parity posture, not yet production-hardened.
- `duplicate_order_groups` is a narrow, conservative heuristic
  (same customer + same-second commit) that under-counts real
  duplicates by design (`catalog-service/app/services/analytics.py:555-563`).
- Fleet-wide customer active/inactive is not computed anywhere — only
  per-customer, on-demand, on the Customer 360 page.
- No historical salesman attribution before `CustomerOwnershipHistory`
  existed; ~40,000 legacy customers start with no assigned salesman
  (`docs/audit/06_data_limitations.md` items 1 and 5).
- No durable "order placed on date X" concept independent of
  `committed_at` (`docs/audit/06_data_limitations.md` item 2).
- `order_details.qty` has no DB-level guard against zero/negative values
  (`docs/audit/06_data_limitations.md` item 4) — analytics summing
  quantity trusts the data is clean; this was not re-verified against
  live data this phase (out of scope, same as the original audit noted).
- `Item.category` is free text, not normalized
  (`docs/audit/06_data_limitations.md` item 9).

**New, found this phase:**
- Three genuine timezone day/month-boundary bugs in
  `date_trunc(...)` calls without an explicit UTC conversion — all three
  fixed (Part 2): `backend`'s `volume_over_time()` (the originally-flagged
  one) and `ai_quality_trend()`, and `catalog-service`'s `orders_trend()`.
  All three proven to be real (not cosmetic) via revert-and-rerun.
- The full request lifecycle (Created → Claimed → Accepted/Rejected)
  had no single test exercising `claim()` and `accept()`/`reject()`
  together against the same request — closed with a new 4-test file.
- Gemini's specific `429` rate-limit status was untested (only a
  generic non-200) — closed with one new test.
- No route-level test ever actually drove a request through
  `handleUpstreamError`/`UpstreamError` (the mechanism every route
  relies on for graceful degradation) — closed with a new 4-test file
  covering 3 representative routes plus a negative control.
- No test constructs a literally-expired (rather than malformed) JWT —
  not closed (Part 4 is investigation-only), but the code path is
  provably shared with the tested malformed-token case.

---

## Files changed this phase

**`backend` (Python, own git history — commit separately):**
- `app/services/analytics.py` — UTC-wrap fix for `volume_over_time()`
  and `ai_quality_trend()`.
- `tests/test_analytics.py` — 2 new boundary tests.
- `tests/test_request_lifecycle.py` — new file, 4 lifecycle tests.

**`catalog-service` (Python, own git history — commit separately):**
- `app/services/analytics.py` — UTC-wrap fix for `orders_trend()`.
- `tests/test_analytics.py` — 1 new boundary test.

**`vendo-intelligence-web` (this worktree, branch `phase17-certification`):**
- `backend/test/geminiClient.spec.ts` — 1 new 429 test.
- `backend/test/upstreamUnavailable.spec.ts` — new file, 4 tests.
- `docs/PHASE_17_CERTIFICATION.md` — this report.

No other files were touched. Nothing was refactored, renamed, or
"cleaned up" outside of a found, specific issue or a found, specific
test gap, per this phase's working method.
