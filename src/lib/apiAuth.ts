import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import type { Profile } from "@/lib/types";

export async function requireApiUser(): Promise<
  { ok: true; profile: Profile } | { ok: false; response: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    };
  }

  return { ok: true, profile: profile as Profile };
}
