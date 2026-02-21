import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { ReportsClient } from "./ReportsClient";
import type { SalesRow, BestSellerRow, ProfitSummary, MovementRow } from "./ReportsClient";

function monthBounds() {
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const toDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const displayFrom = fromDate.toISOString().slice(0, 10);
  const displayTo = new Date(toDate.getTime() - 86400000).toISOString().slice(0, 10);
  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    displayFrom,
    displayTo
  };
}

export default async function ReportsPage() {
  const { from, to, displayFrom, displayTo } = monthBounds();
  const admin = createSupabaseAdminClient();

  const [salesRes, bsRes, profitRes, movRes] = await Promise.all([
    admin.rpc("sales_report", { p_from: from, p_to: to }),
    admin.rpc("best_selling_products", { p_from: from, p_to: to, p_limit: 10 }),
    admin.rpc("net_profit_summary", { p_from: from, p_to: to }),
    admin.rpc("stock_movements_report", { p_from: from, p_to: to })
  ]);

  return (
    <ReportsClient
      initialData={{
        salesRows: (salesRes.data ?? []) as SalesRow[],
        bestSellers: (bsRes.data ?? []) as BestSellerRow[],
        profit: ((profitRes.data as ProfitSummary[] | null)?.[0]) ?? null,
        movements: (movRes.data ?? []) as MovementRow[],
        defaultFrom: displayFrom,
        defaultTo: displayTo
      }}
    />
  );
}
