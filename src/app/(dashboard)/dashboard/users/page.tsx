import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { canManageUsers } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { UserManagementClient } from "@/components/UserManagementClient";

export default async function UsersPage() {
  const profile = await requireAuth();
  if (!canManageUsers(profile.role)) redirect("/dashboard/invoices");

  const admin = createSupabaseAdminClient();

  const [{ data: authData }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("id, full_name, role, is_active, created_at")
  ]);

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

  const users = (authData?.users ?? [])
    .filter((u) => profileMap.has(u.id))
    .map((u) => {
      const p = profileMap.get(u.id)!;
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: p.full_name,
        role: p.role as "manager" | "supervisor" | "sales",
        is_active: p.is_active,
        created_at: p.created_at as string
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div className="page">
      <section className="page-head reveal">
        <div>
          <h1>User Management</h1>
          <p className="page-subtitle">Add, edit, and manage team access.</p>
        </div>
      </section>
      <UserManagementClient users={users} currentUserId={profile.id} />
    </div>
  );
}
