import { z } from "zod";
import type { Period } from "./metricContract.js";

// Shared query-param shape - date range, salesman, customer, item,
// category, request status, intent, order source - reused across every
// route per the master prompt's "consistently support" requirement
// (03_phase_3_node_backend.md). Not every route uses every field; each
// route destructures only what it needs.
export const FiltersQuery = z.object({
  date_from: z.string().datetime({ offset: true }).optional(),
  date_to: z.string().datetime({ offset: true }).optional(),
  salesman: z.string().min(1).optional(),
  customer: z.string().min(1).optional(),
  item: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  intent: z.string().min(1).optional(),
  order_source: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type Filters = z.infer<typeof FiltersQuery>;

export function periodOf(f: Filters): Period | null {
  if (!f.date_from && !f.date_to) return null;
  return { from: f.date_from ?? null, to: f.date_to ?? null };
}

export function filtersToRecord(f: Filters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// Shared filter->upstream-param mapping, since most routes call both
// services with the same incoming query filters.
export function toOrdersParams(f: Filters) {
  return {
    date_from: f.date_from,
    date_to: f.date_to,
    cust_nb: f.customer,
    item_nb: f.item,
    category: f.category,
    order_type: f.order_source,
    salesman_id: f.salesman,
  };
}

export function toRequestsParams(f: Filters) {
  return {
    date_from: f.date_from,
    date_to: f.date_to,
    salesman_id: f.salesman,
    cust_nb: f.customer,
    status: f.status,
    intent: f.intent,
  };
}
