import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const admin = createSupabaseAdminClient();
  const [{ data: metrics, error: metricsError }, { data: receivables, error: rError }] =
    await Promise.all([
      admin.rpc("dashboard_metrics"),
      admin
        .from("invoices")
        .select(
          "id, invoice_number, customer_name, total, paid_amount, remaining_amount, payment_status, created_at"
        )
        .eq("status", "confirmed")
        .in("payment_status", ["unpaid", "partially_paid"])
        .order("created_at", { ascending: false })
        .limit(100)
    ]);

  if (metricsError || rError) {
    return NextResponse.json(
      { error: metricsError?.message ?? rError?.message ?? "Failed to fetch report." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    metrics: metrics?.[0] ?? null,
    receivables: receivables ?? []
  });
}
