export type ClassificationState = "Understocked" | "Watch" | "OK" | "Slow-mover" | "Insufficient data";

export interface Product {
  id: string;
  user_id: string;
  name: string;
  stock_quantity: number;
  lead_time_days: number | null;
  buffer_days: number;
  created_at: string;
  updated_at: string;
}

export interface SalesEntry {
  id: string;
  product_id: string;
  user_id: string;
  units_sold: number;
  start_date: string;
  end_date: string;
  created_at: string;
}
