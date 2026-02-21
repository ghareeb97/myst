import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/apiAuth";
import { canManageUsers } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const changePasswordSchema = z.object({
  password: z.string().min(8)
});

// POST /api/users/[id]/password — change user password (manager only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canManageUsers(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const payload = await request.json();
  const parsed = changePasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, {
    password: parsed.data.password
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
