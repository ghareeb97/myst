import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { canAccessManagerRoutes } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canAccessManagerRoutes(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("low_stock_items");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
