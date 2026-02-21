import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth";
import { DashboardNav } from "@/components/DashboardNav";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children
}: {
  children: ReactNode;
}) {
  const profile = await requireAuth();

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-eyebrow">Inventory Workspace</span>
          <strong>Myst</strong>
        </div>
        <div className="sidebar-user">
          <div className="sidebar-user-name">{profile.full_name}</div>
          <span className="badge">{profile.role}</span>
        </div>
        <DashboardNav variant="sidebar" />
        <div className="sidebar-footer">
          <SignOutButton className="full-width" />
        </div>
      </aside>

      <div>
        <header className="mobile-header">
          <div className="mobile-header-row">
            <div>
              <div className="mobile-brand">Myst</div>
              <div className="muted caption">
                {profile.full_name}
              </div>
            </div>
            <SignOutButton className="sm" />
          </div>
          <DashboardNav variant="mobile" />
        </header>
        <main className="container page-content">{children}</main>
      </div>
    </div>
  );
}
