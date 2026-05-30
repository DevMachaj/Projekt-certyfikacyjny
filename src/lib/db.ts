import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product, SalesEntry } from "@/types";

export async function getProductsByUser(supabase: SupabaseClient, userId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data as Product[];
}

export async function getSalesEntriesByProduct(supabase: SupabaseClient, productId: string): Promise<SalesEntry[]> {
  const { data, error } = await supabase
    .from("sales_entries")
    .select("*")
    .eq("product_id", productId)
    .order("start_date", { ascending: true });

  if (error) throw error;
  return data as SalesEntry[];
}
