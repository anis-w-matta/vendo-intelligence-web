import type { Filters } from "./types";

// Mirrors the BFF's FiltersQuery field set (backend/src/lib/filters.ts) -
// keep these two lists in sync if either side adds a filter.
const FILTER_KEYS: (keyof Filters)[] = [
  "date_from", "date_to", "salesman", "customer", "item",
  "category", "status", "intent", "order_source", "limit",
];

export function filtersToSearchParams(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = f[key];
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return params;
}

export function searchParamsToFilters(params: URLSearchParams): Filters {
  const f: Filters = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value === null || value === "") continue;
    if (key === "limit") {
      const n = Number(value);
      if (Number.isFinite(n)) f.limit = n;
    } else {
      (f as Record<string, string>)[key] = value;
    }
  }
  return f;
}

export function isEmptyFilters(f: Filters): boolean {
  return FILTER_KEYS.every((k) => f[k] === undefined || f[k] === null || f[k] === "");
}
