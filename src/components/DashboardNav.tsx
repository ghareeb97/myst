"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardNavProps = {
  variant: "sidebar" | "mobile";
};

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    isActive: (pathname: string) => pathname === "/dashboard"
  },
  {
    href: "/dashboard/products",
    label: "Products",
    isActive: (pathname: string) =>
      pathname === "/dashboard/products" || pathname.startsWith("/dashboard/products/")
  },
  {
    href: "/dashboard/invoices",
    label: "Invoices",
    isActive: (pathname: string) =>
      pathname === "/dashboard/invoices" ||
      (/^\/dashboard\/invoices\/[^/]+$/.test(pathname) &&
        !pathname.endsWith("/new"))
  },
  {
    href: "/dashboard/invoices/new",
    label: "New Invoice",
    isActive: (pathname: string) => pathname === "/dashboard/invoices/new"
  },
  {
    href: "/dashboard/low-stock",
    label: "Low Stock",
    isActive: (pathname: string) => pathname.startsWith("/dashboard/low-stock")
  }
];

export function DashboardNav({ variant }: DashboardNavProps) {
  const pathname = usePathname();
  const navClassName = variant === "sidebar" ? "sidebar-nav" : "mobile-nav";

  return (
    <nav className={navClassName} aria-label="Main">
      {navItems.map((item) => {
        const active = item.isActive(pathname);
        const className = active ? "nav-link active" : "nav-link";

        return (
          <Link key={item.href} href={item.href} className={className}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
