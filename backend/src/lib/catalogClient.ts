// Typed calls into `catalog-service` (Customer/Item/OrderHeader/
// OrderDetail) - see vendo-app/catalog-service. Field names match the
// Python Pydantic Out schemas verbatim. No per-user auth here - this
// service trusts its caller entirely (see docs/audit/04_auth_map.md);
// admin-ness was already enforced by this BFF's own auth middleware
// before any of these functions are called.
import { config } from "../config.js";
import { getJson } from "./httpClient.js";

const client = { service: "catalog-service", baseUrl: config.catalogUrl, apiKey: config.catalogApiKey };

export interface OrdersFilterParams {
  date_from?: string;
  date_to?: string;
  cust_nb?: string;
  item_nb?: string;
  category?: string;
  order_type?: string;
  salesman_id?: string;
}

export interface OrdersSummaryOut {
  order_count: number;
  order_line_count: number;
  item_quantity: string; // Decimal, serialized as a JSON number by FastAPI; string here to avoid float precision loss - parse with Number()/a decimal lib as needed
  avg_items_per_order: string | null;
  orders_excluded_missing_commit_date: number;
}

export function getOrdersSummary(params: OrdersFilterParams): Promise<OrdersSummaryOut> {
  return getJson<OrdersSummaryOut>(client, "/analytics/orders-summary", params);
}

export interface HistogramBucketOut {
  bucket: string;
  order_count: number;
}

export function getItemsPerOrderHistogram(
  params: Pick<OrdersFilterParams, "date_from" | "date_to" | "cust_nb" | "salesman_id">,
): Promise<HistogramBucketOut[]> {
  return getJson<HistogramBucketOut[]>(client, "/analytics/items-per-order-histogram", params);
}

export interface SalesmanOrderMetricsOut {
  salesman_id: string | null;
  order_count: number;
  order_line_count: number;
  item_quantity: string;
  customer_count: number;
}

export interface SalesmenOrderMetricsOut {
  by_salesman: SalesmanOrderMetricsOut[];
  orders_excluded_missing_commit_date: number;
}

export function getSalesmenOrderMetrics(
  params: Omit<OrdersFilterParams, "salesman_id">,
): Promise<SalesmenOrderMetricsOut> {
  return getJson<SalesmenOrderMetricsOut>(client, "/analytics/salesmen-order-metrics", params);
}

export interface RankedCustomerOut {
  cust_nb: string;
  customer_name: string;
  order_count: number;
  item_quantity: string;
}

export function getTopCustomers(
  orderBy: "order_count" | "item_quantity",
  limit: number,
  // item_nb (Phase 9 Item x Customer matrix): "which customers buy this item".
  params: Pick<OrdersFilterParams, "date_from" | "date_to" | "salesman_id" | "item_nb">,
): Promise<RankedCustomerOut[]> {
  return getJson<RankedCustomerOut[]>(client, "/analytics/top-customers", {
    order_by: orderBy,
    limit,
    ...params,
  });
}

export interface RankedItemOut {
  item_nb: string;
  item_desc: string;
  category: string;
  item_quantity: string;
  order_count: number;
  customer_count: number;
}

export function getTopItems(
  orderBy: "quantity" | "order_frequency",
  limit: number,
  params: Pick<OrdersFilterParams, "date_from" | "date_to" | "category" | "salesman_id" | "cust_nb">,
): Promise<RankedItemOut[]> {
  return getJson<RankedItemOut[]>(client, "/analytics/top-items", {
    order_by: orderBy,
    limit,
    ...params,
  });
}

export interface TrendPointOut {
  bucket: string;
  order_count: number;
  order_line_count: number;
  item_quantity: string;
}

export interface OrdersTrendOut {
  points: TrendPointOut[];
  orders_excluded_missing_commit_date: number;
}

// Monthly order/line/quantity trend - fleet-wide (Phase 6) or scoped via
// params.salesman_id (Phase 7, same point-in-time ownership attribution as
// getSalesmenOrderMetrics).
export function getOrdersTrend(params: OrdersFilterParams): Promise<OrdersTrendOut> {
  return getJson<OrdersTrendOut>(client, "/analytics/orders-trend", params);
}

export interface CustomerOrderHistoryRowOut {
  order_nb: string;
  order_type: string;
  committed_at: string;
  item_quantity: string;
  order_line_count: number;
}

// One customer's committed orders, oldest first - raw material for Phase
// 8's frequency/interval/activity-state classification (computed in the
// BFF from this list, never invented here or in catalog-service).
export function getCustomerOrderHistory(custNb: string): Promise<CustomerOrderHistoryRowOut[]> {
  return getJson<CustomerOrderHistoryRowOut[]>(
    client, `/analytics/customers/${encodeURIComponent(custNb)}/order-history`,
  );
}

export interface CategorySummaryOut {
  category: string;
  item_quantity: string;
  order_count: number;
  customer_count: number;
  share_of_total_quantity: string | null;
}

export function getCategoriesSummary(
  params: Pick<OrdersFilterParams, "date_from" | "date_to" | "salesman_id">,
): Promise<CategorySummaryOut[]> {
  return getJson<CategorySummaryOut[]>(client, "/analytics/categories-summary", params);
}

export interface CustomersSummaryOut {
  total: number;
  assigned: number;
  unassigned: number;
}

export function getCustomersSummary(): Promise<CustomersSummaryOut> {
  return getJson<CustomersSummaryOut>(client, "/analytics/customers-summary");
}

export interface CustomerDetailSummaryOut {
  cust_nb: string;
  customer_name: string;
  current_salesman_id: string | null;
  order_count: number;
  order_line_count: number;
  item_quantity: string;
  avg_items_per_order: string | null;
  last_order_committed_at: string | null;
}

export function getCustomerSummary(custNb: string): Promise<CustomerDetailSummaryOut> {
  return getJson<CustomerDetailSummaryOut>(client, `/analytics/customers/${encodeURIComponent(custNb)}/summary`);
}

export interface OwnershipHistoryEntryOut {
  salesman_id: string | null;
  effective_from: string;
  effective_to: string | null;
}

export function getCustomerOwnershipHistory(custNb: string): Promise<OwnershipHistoryEntryOut[]> {
  return getJson<OwnershipHistoryEntryOut[]>(client, `/customers/${encodeURIComponent(custNb)}/ownership-history`);
}

export interface ItemDetailSummaryOut {
  item_nb: string;
  item_desc: string;
  category: string;
  item_quantity: string;
  order_count: number;
  customer_count: number;
  avg_qty_per_occurrence: string | null;
}

export function getItemSummary(itemNb: string): Promise<ItemDetailSummaryOut> {
  return getJson<ItemDetailSummaryOut>(client, `/analytics/items/${encodeURIComponent(itemNb)}/summary`);
}

export interface CatalogDataHealthOut {
  total_orders: number;
  orders_with_committed_at: number;
  orders_with_resolvable_attribution: number;
  total_order_details: number;
  order_details_violating_qty_constraint: number;
}

export function getCatalogDataHealth(): Promise<CatalogDataHealthOut> {
  return getJson<CatalogDataHealthOut>(client, "/analytics/data-health");
}
