import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/apiAuth";
import { canManageUsers } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

// GET /api/users — list all users (manager only)
export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canManageUsers(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  // List all auth users (paginated, up to 1000)
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Fetch all profiles
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, role, is_active, created_at");
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

  const users = authData.users
    .filter((u) => profileMap.has(u.id))
    .map((u) => {
      const profile = profileMap.get(u.id)!;
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: profile.full_name,
        role: profile.role,
        is_active: profile.is_active,
        created_at: profile.created_at
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return NextResponse.json({ users });
}

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().trim().min(1),
  role: z.enum(["manager", "supervisor", "sales"])
});

// POST /api/users — create a new user (manager only)
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canManageUsers(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json();
  const parsed = createUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();

  // Create the auth user
  const { data: userData, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true
  });
  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 });
  }

  // Upsert the profile
  const { error: profileError } = await admin.from("profiles").upsert({
    id: userData.user.id,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
    is_active: true
  });
  if (profileError) {
    // Roll back the auth user if profile fails
    await admin.auth.admin.deleteUser(userData.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: userData.user.id,
      email: parsed.data.email,
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      is_active: true
    },
    { status: 201 }
  );
}
