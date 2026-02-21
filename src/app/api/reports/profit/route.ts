import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

function monthBounds(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { from, to };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { searchParams } = req.nextUrl;
  const bounds = monthBounds();
  const from = searchParams.get("from") ?? bounds.from;
  const to = searchParams.get("to") ?? bounds.to;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("net_profit_summary", {
    p_from: from,
    p_to: to
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ summary: data?.[0] ?? null });
}
