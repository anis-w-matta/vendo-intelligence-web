# 02 — Database Map

> No financial data (price, revenue, amount, order value) appears anywhere in this document. Money-related columns (`unit_price`, `qra_price`, `item.category`-adjacent pricing, etc.) are listed only where they exist in the schema, never as something the analytics layer should read.

Two separate Postgres schemas/databases, one per service. No cross-database foreign keys — cross-service references (`Customer.salesman_id`, `OrderHeader.cust_nb`) are plain indexed string columns, deliberately not FK-constrained, because the referenced table lives in the other service.

## backend database

### `salesman` (`app/models/salesman.py`)
| column | type | notes |
|---|---|---|
| `login_id` | String(50) | **PK** |
| `password_hash` | String(255) | bcrypt |
| `name` | String(150) | |
| `email` | String(255) | nullable |
| `is_active` | Boolean, default True | |
| `role` | String(20), default `"salesman"` | added by migration `aa0916e613fb`; values: `"salesman"`, `"admin"` |
| `created_at` | timestamptz, server default now() | |

`is_admin` is a Python property (`role == "admin"`), not a column.

### `voice_message` (`app/models/voice.py`)
| column | type | notes |
|---|---|---|
| `id` | BigInteger | **PK** |
| `phone_raw` | String(50) | |
| `audio_path` | Text | |
| `duration_sec` | Numeric(8,2) | nullable |
| `transcript`, `normalized_transcript` | Text | nullable |
| `transcript_quality` | String(20), default `"good"` | |
| `transcription_disagreement` | Boolean, default False | |
| `transcript_attempts` | JSONB list | |
| `transcript_conf` | Float | nullable |
| `language` | String(10) | nullable |
| `languages` | JSONB list | |
| `segments` | JSONB list | |
| `status` | String(20), default `"received"`, indexed | `received → transcribing → transcribed → drafted`, or `failed`/`too_long` |
| `transcript_source` | String(20), default `"server"` | `"server"` (Gemini) or `"client_whisper"` |
| `error` | Text | nullable |
| `attempts` | int, default 0 | |
| `received_at` | timestamptz, server default now() | |
| `claimed_at`, `processed_at` | timestamptz | nullable |

### `pending_request` (`app/models/buffer.py`)
| column | type | notes |
|---|---|---|
| `id` | BigInteger | **PK** |
| `voice_message_id` | FK → `voice_message.id` | |
| `cust_nb` | String(20), indexed | nullable |
| `intents` | JSONB list | |
| `primary_intent` | String(40) | |
| `target_order_nb` | String(30) | nullable |
| `target_order_type` | String(10) | nullable |
| `raw_model_output` | JSONB dict | also carries the commit-saga replay payload under key `commit_request` |
| `flags` | JSONB list | |
| `classification_quality` | String(20), default `"good"` | |
| `status` | String(20), default `"new"`, indexed | `new / in_review / callback / rejected / committing` (`committed` defined but never persisted — row is deleted instead, see doc 06) |
| `assigned_to` | String(100) | nullable, claimant's `login_id` |
| `claimed_at` | timestamptz | nullable |
| `created_at` | timestamptz, server default now() | **intake/draft time, not an order date** — see doc 06 |
| `decided_at` | timestamptz | nullable; also reused as a "commit started" marker |
| `decided_by` | String(100) | nullable |
| `decision_note` | Text | nullable |
| `committed_order_nb` | String(30) | nullable — declared but never actually set anywhere in code; row is deleted on commit instead |
| `commit_intent_id` | String(36), unique, indexed | nullable; commit-saga idempotency key |

### `pending_request_line` (`app/models/buffer.py`)
| column | type | notes |
|---|---|---|
| `id` | BigInteger | **PK** |
| `request_id` | FK → `pending_request.id`, ON DELETE CASCADE | |
| `line_nb` | int | |
| `raw_text`, `raw_lang` | Text / String(10) | |
| `item_nb` | String(30) | nullable |
| `item_desc` | String(300) | nullable |
| `qty` | Numeric(12,3) | nullable |
| `uom` | String(20) | nullable |
| `match_confidence` | Float | nullable — AI item-match confidence |
| `match_method` | String(20) | nullable |
| `change` | String(10) | nullable — add/remove/increase/decrease |
| `operator_edited` | Boolean, default False | AI-vs-human edit flag |
| `candidates` | JSONB list | |
| `line_flags` | JSONB list | |
| `resolution_meta`, `attributes`, `qualifiers` | JSONB dict | |

There is no separate `RequestDetail` DB model — that name only exists as an API response schema (`app/schemas/api_out.py`).

### `activity_log` (`app/models/activity.py`)
| column | type | notes |
|---|---|---|
| `id` | BigInteger | **PK** |
| `ts` | timestamptz, server default now(), indexed | |
| `event_type` | String(40), indexed | e.g. `order_committed` |
| `level` | String(10), default `"info"` | |
| `voice_message_id`, `request_id` | BigInteger, indexed | **not FK-constrained** — plain integers, so rows survive after the referenced `PendingRequest` is deleted |
| `cust_nb` | String(20), indexed | nullable |
| `order_nb` | String(30) | nullable |
| `message` | Text | |
| `details` | JSONB dict | |

## catalog-service database

### `customer` (`app/models/customer.py`)
| column | type | notes |
|---|---|---|
| `customer_number` | String(20) | **PK** (`"CustomerNumber"` column name) |
| `customer_name` | String(200) | |
| `email` | String(200) | nullable |
| `telephone` | String(50) | nullable |
| `city` | String(100) | nullable |
| `address1`, `address2` | String(200) | nullable |
| `salesman_id` | String(50), indexed, nullable | current owner; not FK'd (Salesman lives in `backend`) |

### `item` (`app/models/item.py`)
| column | type | notes |
|---|---|---|
| `item_number` | String(30) | **PK** |
| `item_desc` | String(300) | |
| `category` | String(100), indexed | plain free-text column, **no separate Category table** |

### `order_header` (`app/models/order.py`)
| column | type | notes |
|---|---|---|
| `order_nb` | String(30) | **PK part 1** |
| `order_type` | String(10) | **PK part 2** — composite identity confirmed |
| `cust_nb` | String(20), indexed | not FK'd |
| `commit_intent_id` | String(36), unique, indexed | nullable — idempotency key from the commit saga |

No `status`, `created_at`, or salesman column exists — all deliberately dropped in earlier migrations (see doc's migration history in doc 09).

### `order_details` (`app/models/order.py`)
| column | type | notes |
|---|---|---|
| `order_nb` | String(30) | **PK part 1**, FK → `order_header.order_nb`+`order_type` (composite) |
| `order_type` | String(10) | **PK part 2** |
| `line_nb` | int | **PK part 3** |
| `item_nb` | String(30) | |
| `item_desc` | String(300) | |
| `qty` | Numeric(12,3) | **no CHECK constraint** — NULL is rejected at the service layer, zero/negative are not (see doc 06) |
| `uom` | String(20) | |
| `line_type` | String(1), default `"S"` | always `"S"` today; column exists for future ERP line types |
| `is_free` | Boolean, default False | set only by the QRA engine for bonus lines |

No `qra_detail_id` column (confirmed dropped/legacy — `migrate_data.py` lists it among fields removed before the catalog-service split).

### `qra_header` (`app/models/qra.py`)
| column | type | notes |
|---|---|---|
| `cust_nb` | String(20), FK → `customer.CustomerNumber` | **PK** — one agreement per customer |
| `from_date`, `to_date` | Date | active window |
| `status` | String(20), default `"active"` | |

### `qra_detail` (`app/models/qra.py`)
| column | type | notes |
|---|---|---|
| `cust_nb` | String(20), FK → `qra_header.cust_nb` ON DELETE CASCADE | **PK** — one rule row per customer |
| `qra_type` | String(1) | `"T"` (bonus), `"P"` (price override), `"B"` (both) |
| `item_nb_buy`, `item_nb_get`, `item_nb_price` | String(30), nullable | |
| `qty_buy` | Numeric(12,3) | |
| `qty_get` | Numeric(12,3), nullable | |

`qra_price` is out of scope for this non-financial audit (a promotional pricing field, not an analytics source).

## Canonical metric definitions (confirmed against the actual schema)

- **Order Count** = count of distinct `(order_nb, order_type)` pairs in `order_header`.
- **Order Line Count** = row count in `order_details`.
- **Item Quantity** = `SUM(order_details.qty)` (filtered by valid-qty rules once defined — see doc 06).

These three are structurally distinct in the schema (composite-key header table vs. line table vs. a summed numeric column) — there is no way to accidentally collapse them by construction, but nothing currently *enforces* the qty-validity filtering.
