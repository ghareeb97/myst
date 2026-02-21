import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth";
import { DashboardNav } from "@/components/DashboardNav";
import { SignOutButton } from "@/components/SignOutButton";
import { MobileDrawer } from "@/components/MobileDrawer";
import { ToastProvider } from "@/components/Toast";

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
        <MobileDrawer
          fullName={profile.full_name}
          role={profile.role}
        />
        <ToastProvider>
          <main className="container page-content">{children}</main>
        </ToastProvider>
      </div>
    </div>
  );
}
