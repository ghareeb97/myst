import Link from "next/link";
import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export default async function DashboardLayout({
  children
}: {
  children: ReactNode;
}) {
  const profile = await requireAuth();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div style={{ minWidth: 0 }}>
            <strong>Myst</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              {profile.full_name} <span className="badge">{profile.role}</span>
            </div>
          </div>
          <SignOutButton />
        </div>
        <div className="topbar-inner" style={{ paddingTop: 0 }}>
          <nav className="nav" aria-label="Main">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/dashboard/products">Products</Link>
            <Link href="/dashboard/invoices">Invoices</Link>
            <Link href="/dashboard/invoices/new">New Invoice</Link>
            <Link href="/dashboard/low-stock">Low Stock</Link>
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
