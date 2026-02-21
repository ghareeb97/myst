"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import type { Route } from "next";
import {
  IconDashboard,
  IconProducts,
  IconInvoices,
  IconNewInvoice,
  IconLowStock,
  IconReports,
} from "@/components/Icons";

type DashboardNavProps = {
  variant: "sidebar" | "mobile";
};

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    Icon: IconDashboard,
    isActive: (pathname: string) => pathname === "/dashboard"
  },
  {
    href: "/dashboard/products",
    label: "Products",
    Icon: IconProducts,
    isActive: (pathname: string) =>
      pathname === "/dashboard/products" || pathname.startsWith("/dashboard/products/")
  },
  {
    href: "/dashboard/invoices",
    label: "Invoices",
    Icon: IconInvoices,
    isActive: (pathname: string) =>
      pathname === "/dashboard/invoices" ||
      (/^\/dashboard\/invoices\/[^/]+$/.test(pathname) &&
        !pathname.endsWith("/new"))
  },
  {
    href: "/dashboard/invoices/new",
    label: "New Invoice",
    Icon: IconNewInvoice,
    isActive: (pathname: string) => pathname === "/dashboard/invoices/new"
  },
  {
    href: "/dashboard/low-stock",
    label: "Low Stock",
    Icon: IconLowStock,
    isActive: (pathname: string) => pathname.startsWith("/dashboard/low-stock")
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    Icon: IconReports,
    isActive: (pathname: string) => pathname.startsWith("/dashboard/reports")
  }
] as const satisfies ReadonlyArray<{
  href: Route;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  isActive: (pathname: string) => boolean;
}>;

export function DashboardNav({ variant }: DashboardNavProps) {
  const pathname = usePathname();
  const navClassName = variant === "sidebar" ? "sidebar-nav" : "mobile-nav";
  const showIcons = variant === "sidebar";

  return (
    <nav className={navClassName} aria-label="Main">
      {navItems.map((item) => {
        const active = item.isActive(pathname);
        const className = active ? "nav-link active" : "nav-link";
        const NavIcon = item.Icon;

        return (
          <Link key={item.href} href={item.href} className={className}>
            {showIcons ? <NavIcon /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
