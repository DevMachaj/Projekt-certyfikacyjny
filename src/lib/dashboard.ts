import { classify, STATE_ORDER, type ClassificationResult } from "@/lib/classification";
import type { ClassificationState, Product, SalesEntry } from "@/types";

/** A product paired with its computed classification — the unit the dashboard renders. */
export interface ProductClassification {
  product: Product;
  classification: ClassificationResult;
}

/**
 * Classify a user's full catalog from already-loaded batches: group the flat `entries` list by
 * `product_id`, then pair each product with its `classify()` result. Pure — no Supabase, no
 * fetching; the caller passes the two batches it already loaded (the dashboard page and the
 * restocking endpoint share this one source of truth).
 *
 * Preserves the input order of `products` (which `getProductsByUser` returns name-sorted), so
 * downstream grouping/selection keeps alphabetical order for free.
 */
export function classifyUserCatalog(products: Product[], entries: SalesEntry[]): ProductClassification[] {
  const entriesByProduct = new Map<string, SalesEntry[]>();
  for (const entry of entries) {
    const list = entriesByProduct.get(entry.product_id);
    if (list) list.push(entry);
    else entriesByProduct.set(entry.product_id, [entry]);
  }

  return products.map((product) => ({
    product,
    classification: classify(product, entriesByProduct.get(product.id) ?? []),
  }));
}

/** One non-empty dashboard group: a state and the products classified into it. */
export interface StateGroup {
  state: ClassificationState;
  items: ProductClassification[];
}

/**
 * Group already-classified products by state, in the fixed `STATE_ORDER`, omitting states with
 * zero items. Input order is preserved within each group — the caller passes products already
 * sorted by name (via `getProductsByUser`), so within-group alphabetical order is free.
 *
 * Pure: no Supabase, no `classify()` call. The caller classifies; this just buckets and orders,
 * which makes it trivially unit-testable.
 */
export function groupProductsByState(items: ProductClassification[]): StateGroup[] {
  const buckets = new Map<ClassificationState, ProductClassification[]>();
  for (const item of items) {
    const bucket = buckets.get(item.classification.state);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(item.classification.state, [item]);
    }
  }

  const groups: StateGroup[] = [];
  for (const state of STATE_ORDER) {
    const bucket = buckets.get(state);
    if (bucket && bucket.length > 0) {
      groups.push({ state, items: bucket });
    }
  }
  return groups;
}
