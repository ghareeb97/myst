import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

// dashboard_metrics() and low_stock_items() are service-role only (they have no role check of
// their own). Call these only from server pages that have already run requireAuth() and the
// manager check.

export async function getDashboardMetrics() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("dashboard_metrics");
  if (error) throw error;
  return (data?.[0] ?? {
    invoices_today: 0,
    invoices_month: 0,
    revenue_today: 0,
    revenue_month: 0,
    low_stock_count: 0
  }) as {
    invoices_today: number;
    invoices_month: number;
    revenue_today: number;
    revenue_month: number;
    low_stock_count: number;
  };
}

export async function getLowStockItems() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("low_stock_items");
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    sku: string;
    name: string;
    current_stock: number;
    threshold: number;
  }>;
}
