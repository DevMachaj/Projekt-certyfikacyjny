import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Product, SalesEntry } from "@/types";
import type { ProductInput, ProductUpdateInput } from "@/lib/validation/product";
import type { SalesEntryInput } from "@/lib/validation/sales-entry";

export async function getProductsByUser(supabase: SupabaseClient, userId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data as Product[];
}

export async function createProduct(supabase: SupabaseClient, userId: string, input: ProductInput): Promise<Product> {
  const { data, error } = (await supabase
    .from("products")
    .insert({ ...input, user_id: userId })
    .select("*")
    .single()) as { data: Product | null; error: PostgrestError | null };

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");
  return data;
}

export async function updateProduct(
  supabase: SupabaseClient,
  id: string,
  patch: ProductUpdateInput,
): Promise<Product | null> {
  // `products.updated_at` has no DB trigger (DEFAULT now() on insert only), so we set it
  // explicitly here — otherwise it stays frozen at the insert timestamp across edits.
  const { data, error } = (await supabase
    .from("products")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle()) as { data: Product | null; error: PostgrestError | null };

  if (error) throw error;
  return data;
}

export async function deleteProduct(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = (await supabase.from("products").delete().eq("id", id).select("id")) as {
    data: { id: string }[] | null;
    error: PostgrestError | null;
  };

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getProductById(supabase: SupabaseClient, id: string): Promise<Product | null> {
  const { data, error } = (await supabase.from("products").select("*").eq("id", id).maybeSingle()) as {
    data: Product | null;
    error: PostgrestError | null;
  };

  if (error) throw error;
  return data;
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

export async function getSalesEntriesByUser(supabase: SupabaseClient, userId: string): Promise<SalesEntry[]> {
  const { data, error } = await supabase
    .from("sales_entries")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: true });

  if (error) throw error;
  return data as SalesEntry[];
}

export async function createSalesEntry(
  supabase: SupabaseClient,
  userId: string,
  productId: string,
  input: SalesEntryInput,
): Promise<SalesEntry> {
  const { data, error } = (await supabase
    .from("sales_entries")
    .insert({ ...input, user_id: userId, product_id: productId })
    .select("*")
    .single()) as { data: SalesEntry | null; error: PostgrestError | null };

  if (error) throw error;
  if (!data) throw new Error("Insert returned no row");
  return data;
}

export async function deleteSalesEntry(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = (await supabase.from("sales_entries").delete().eq("id", id).select("id")) as {
    data: { id: string }[] | null;
    error: PostgrestError | null;
  };

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
