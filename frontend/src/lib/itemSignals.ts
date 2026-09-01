// Phase 9 (Item & Category Intelligence): per-item investigation signals,
// computed only from data ItemDetailPage already has in hand - the item's
// own summary (item_quantity, order_count, customer_count), its own
// monthly trend series, its "Item x Customer matrix" (top customers for
// this item), and a population of other items already loaded on the page
// (the top-N items list) to compare against.
//
// Same discipline as Phase 7's benchmarking.ts (fleet median/well-above/
// well-below) and Phase 8's backend/src/lib/customerActivity.ts
// (quantity-anomaly ratio thresholds): pure, side-effect-free, every
// threshold defined and tested here so every caller gets the same answer.
// Every signal is evidence for investigation, never a verdict - the
// caller renders these as "Investigate: ..." only, exactly like Phase 7/8.
import { isWellAbove, isWellBelow, mean, median } from "./benchmarking";

export interface TrendValuePoint {
  bucket: string;
  value: number;
}

export interface QuantityTrendSignal {
  type: "quantity_trend";
  mostRecentQuantity: number;
  priorAverageQuantity: number;
  ratio: number; // mostRecent / priorAverage
}

// Same ratio thresholds as backend/src/lib/customerActivity.ts's
// detectSignals quantity-anomaly logic (>=2x spike, <=0.5x decline). Kept
// as local constants here rather than imported, since that module is
// backend-only (a different package, different module graph) and this one
// runs in the frontend.
export const QUANTITY_SPIKE_RATIO = 2;
export const QUANTITY_DECLINE_RATIO = 0.5;

// Compares the item's most recent trend-month quantity against the
// average of its prior months. Needs at least 3 trend points (>=2 prior
// months plus the most recent) to be meaningful - never flags on 1-2 data
// points, and never divides by a zero/negative prior average.
export function detectQuantityTrendSignal(points: TrendValuePoint[]): QuantityTrendSignal | null {
  if (points.length < 3) return null;
  const priorValues = points.slice(0, -1).map((p) => p.value);
  const mostRecent = points[points.length - 1].value;
  const priorAverage = mean(priorValues);
  if (priorAverage === null || priorAverage <= 0) return null;
  const ratio = mostRecent / priorAverage;
  if (ratio >= QUANTITY_SPIKE_RATIO || ratio <= QUANTITY_DECLINE_RATIO) {
    return { type: "quantity_trend", mostRecentQuantity: mostRecent, priorAverageQuantity: priorAverage, ratio };
  }
  return null;
}

export interface TopCustomerForItem {
  customerName: string;
  itemQuantity: number;
}

export interface ConcentratedCustomerSignal {
  type: "concentrated_customer";
  topCustomerName: string;
  topCustomerShare: number; // 0-1, share of this item's total item_quantity
}

// "Concentrated in one customer": from the Item x Customer matrix data, the
// single top customer (by item_quantity, so `topCustomers[0]`) accounts for
// at least this share of the item's total item_quantity (from the item
// summary). Distinct from the low-penetration signal below - this is about
// concentration among the item's *actual* buyers, not how many distinct
// customers buy it at all.
export const CONCENTRATION_SHARE_THRESHOLD = 0.5;

export function detectConcentratedCustomerSignal(
  topCustomers: TopCustomerForItem[],
  totalItemQuantity: number,
): ConcentratedCustomerSignal | null {
  if (topCustomers.length === 0 || !(totalItemQuantity > 0)) return null;
  const top = topCustomers[0];
  const share = top.itemQuantity / totalItemQuantity;
  if (share >= CONCENTRATION_SHARE_THRESHOLD) {
    return { type: "concentrated_customer", topCustomerName: top.customerName, topCustomerShare: share };
  }
  return null;
}

export interface LowPenetrationSignal {
  type: "low_penetration";
  customerCount: number;
  populationMedianCustomerCount: number;
  populationSize: number;
}

// "Low penetration overall": this item's customer_count sits well below
// the median customer_count of whatever item population the caller passed
// in (e.g. the top-N items list already loaded on ItemsPage/
// ItemDetailPage) - NOT literally every item in the catalogue. The caller
// is responsible for documenting, in the rendered copy, exactly which
// population it used. Reuses benchmarking.ts's isWellBelow (< 0.75x the
// comparison value) for consistency with the rest of the app. Requires at
// least 3 items in the population for the median to be meaningful.
export function detectLowPenetrationSignal(
  customerCount: number,
  populationCustomerCounts: number[],
): LowPenetrationSignal | null {
  if (populationCustomerCounts.length < 3) return null;
  const populationMedian = median(populationCustomerCounts);
  if (populationMedian === null || !isWellBelow(customerCount, populationMedian)) return null;
  return {
    type: "low_penetration",
    customerCount,
    populationMedianCustomerCount: populationMedian,
    populationSize: populationCustomerCounts.length,
  };
}

export interface ItemFrequencyQuantity {
  orderCount: number;
  itemQuantity: number;
}

export interface HighFrequencyLowQuantitySignal {
  type: "high_frequency_low_quantity";
  orderCount: number;
  populationMedianOrderCount: number;
  avgQuantityPerOrder: number;
  populationMedianAvgQuantityPerOrder: number;
  populationSize: number;
}

// "High frequency, low quantity": this item's order_count is well above
// its population's median order_count, while its average quantity per
// order (item_quantity / order_count) is well below that population's
// median average quantity per order - i.e. it's ordered often, but in
// small amounts each time. Reuses benchmarking.ts's well-above (>1.5x) /
// well-below (<0.75x) thresholds for consistency with the rest of the
// app. Requires at least 3 items in the population.
export function detectHighFrequencyLowQuantitySignal(
  item: ItemFrequencyQuantity,
  population: ItemFrequencyQuantity[],
): HighFrequencyLowQuantitySignal | null {
  if (population.length < 3) return null;
  const orderCounts = population.map((p) => p.orderCount);
  const avgQuantities = population.map((p) => (p.orderCount > 0 ? p.itemQuantity / p.orderCount : 0));
  const populationMedianOrderCount = median(orderCounts);
  const populationMedianAvgQuantity = median(avgQuantities);
  if (populationMedianOrderCount === null || populationMedianAvgQuantity === null) return null;

  const avgQuantityPerOrder = item.orderCount > 0 ? item.itemQuantity / item.orderCount : 0;
  if (
    isWellAbove(item.orderCount, populationMedianOrderCount) &&
    isWellBelow(avgQuantityPerOrder, populationMedianAvgQuantity)
  ) {
    return {
      type: "high_frequency_low_quantity",
      orderCount: item.orderCount,
      populationMedianOrderCount,
      avgQuantityPerOrder,
      populationMedianAvgQuantityPerOrder: populationMedianAvgQuantity,
      populationSize: population.length,
    };
  }
  return null;
}

// "High quantity concentrated in few customers" is the same underlying
// signal as ConcentratedCustomerSignal above - deliberately not built
// twice. Callers should render ConcentratedCustomerSignal's copy as
// "concentrated in [customer]" and LowPenetrationSignal's copy as
// "low penetration overall" so the two related-but-distinct ideas read as
// distinct on the page.
export type ItemSignal =
  | QuantityTrendSignal
  | ConcentratedCustomerSignal
  | LowPenetrationSignal
  | HighFrequencyLowQuantitySignal;
