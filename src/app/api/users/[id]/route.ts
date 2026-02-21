import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/apiAuth";
import { canManageUsers } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const updateUserSchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  role: z.enum(["manager", "supervisor", "sales"]).optional(),
  is_active: z.boolean().optional()
});

// PATCH /api/users/[id] — update user profile (manager only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canManageUsers(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Prevent manager from deactivating themselves
  if (id === auth.profile.id) {
    const payload = await request.json();
    if (payload.is_active === false) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account." },
        { status: 400 }
      );
    }
    const parsed = updateUserSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("profiles")
      .update(parsed.data)
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const payload = await request.json();
  const parsed = updateUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update(parsed.data)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
