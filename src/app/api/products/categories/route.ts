import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/apiAuth";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("products")
    .select("category")
    .not("category", "is", null)
    .order("category", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const unique = [...new Set((data ?? []).map((r) => r.category as string))];
  return NextResponse.json({ categories: unique });
}
