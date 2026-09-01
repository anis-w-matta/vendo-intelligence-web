import { useState, type FormEvent } from "react";
import type { Filters } from "../../lib/types";

const STATUS_OPTIONS = ["new", "in_review", "committed", "rejected", "callback"];

// Zod's `.datetime({ offset: true })` on the BFF requires a full ISO
// instant, not a bare date - <input type="date"> only gives "YYYY-MM-DD".
function toIsoStart(date: string): string {
  return `${date}T00:00:00Z`;
}
function toIsoEnd(date: string): string {
  return `${date}T23:59:59Z`;
}
function fromIso(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

// One shared filter bar (date range, salesman, customer, item, category,
// status) driving every page via the URL - Phase 5's "global filters"
// requirement. Applies on submit, not per-keystroke, so a filtered query
// isn't refired on every character typed into a customer/item id field.
export function GlobalFilters({
  filters,
  onChange,
  fields = ["date", "salesman", "customer", "item", "category", "status"],
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  fields?: ("date" | "salesman" | "customer" | "item" | "category" | "status")[];
}) {
  const [draft, setDraft] = useState<Filters>(filters);

  function submit(e: FormEvent) {
    e.preventDefault();
    onChange(draft);
  }

  function clear() {
    const empty: Filters = {};
    setDraft(empty);
    onChange(empty);
  }

  const has = (f: typeof fields[number]) => fields.includes(f);

  return (
    <form className="filters-bar" onSubmit={submit} role="search" aria-label="Filters">
      {has("date") && (
        <div className="filter-field">
          <label htmlFor="f-date-from">From</label>
          <input
            id="f-date-from"
            type="date"
            value={fromIso(draft.date_from)}
            onChange={(e) => setDraft((d) => ({ ...d, date_from: e.target.value ? toIsoStart(e.target.value) : undefined }))}
          />
        </div>
      )}
      {has("date") && (
        <div className="filter-field">
          <label htmlFor="f-date-to">To</label>
          <input
            id="f-date-to"
            type="date"
            value={fromIso(draft.date_to)}
            onChange={(e) => setDraft((d) => ({ ...d, date_to: e.target.value ? toIsoEnd(e.target.value) : undefined }))}
          />
        </div>
      )}
      {has("salesman") && (
        <div className="filter-field">
          <label htmlFor="f-salesman">Salesman</label>
          <input
            id="f-salesman"
            type="text"
            placeholder="login id"
            value={draft.salesman ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, salesman: e.target.value || undefined }))}
          />
        </div>
      )}
      {has("customer") && (
        <div className="filter-field">
          <label htmlFor="f-customer">Customer</label>
          <input
            id="f-customer"
            type="text"
            placeholder="cust_nb"
            value={draft.customer ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, customer: e.target.value || undefined }))}
          />
        </div>
      )}
      {has("item") && (
        <div className="filter-field">
          <label htmlFor="f-item">Item</label>
          <input
            id="f-item"
            type="text"
            placeholder="item_nb"
            value={draft.item ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, item: e.target.value || undefined }))}
          />
        </div>
      )}
      {has("category") && (
        <div className="filter-field">
          <label htmlFor="f-category">Category</label>
          <input
            id="f-category"
            type="text"
            value={draft.category ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value || undefined }))}
          />
        </div>
      )}
      {has("status") && (
        <div className="filter-field">
          <label htmlFor="f-status">Status</label>
          <select
            id="f-status"
            value={draft.status ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value || undefined }))}
          >
            <option value="">Any</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
      <button type="submit" className="btn btn-primary">Apply</button>
      <button type="button" className="btn" onClick={clear}>Clear</button>
    </form>
  );
}
