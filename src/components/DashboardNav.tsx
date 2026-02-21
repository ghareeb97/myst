"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import type { Route } from "next";
import type { Role } from "@/lib/types";
import {
  IconDashboard,
  IconProducts,
  IconInvoices,
  IconNewInvoice,
  IconLowStock,
  IconReports,
  IconUsers,
} from "@/components/Icons";

type DashboardNavProps = {
  variant: "sidebar" | "mobile" | "drawer";
  role: Role;
  onNavigate?: () => void;
};

type NavItem = {
  href: Route | string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  isActive: (pathname: string) => boolean;
  managerOnly?: boolean;
};

const allNavItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    Icon: IconDashboard,
    isActive: (pathname: string) => pathname === "/dashboard",
    managerOnly: true,
  },
  {
    href: "/dashboard/products",
    label: "Products",
    Icon: IconProducts,
    isActive: (pathname: string) =>
      pathname === "/dashboard/products" || pathname.startsWith("/dashboard/products/"),
    managerOnly: true,
  },
  {
    href: "/dashboard/invoices",
    label: "Invoices",
    Icon: IconInvoices,
    isActive: (pathname: string) =>
      pathname === "/dashboard/invoices" ||
      (/^\/dashboard\/invoices\/[^/]+$/.test(pathname) &&
        !pathname.endsWith("/new")),
  },
  {
    href: "/dashboard/invoices/new",
    label: "New Invoice",
    Icon: IconNewInvoice,
    isActive: (pathname: string) => pathname === "/dashboard/invoices/new",
  },
  {
    href: "/dashboard/low-stock",
    label: "Low Stock",
    Icon: IconLowStock,
    isActive: (pathname: string) => pathname.startsWith("/dashboard/low-stock"),
    managerOnly: true,
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    Icon: IconReports,
    isActive: (pathname: string) => pathname.startsWith("/dashboard/reports"),
    managerOnly: true,
  },
  {
    href: "/dashboard/users",
    label: "Users",
    Icon: IconUsers,
    isActive: (pathname: string) => pathname.startsWith("/dashboard/users"),
    managerOnly: true,
  },
];

export function DashboardNav({ variant, role, onNavigate }: DashboardNavProps) {
  const pathname = usePathname();
  const navClassName =
    variant === "sidebar"
      ? "sidebar-nav"
      : variant === "drawer"
        ? "drawer-nav"
        : "mobile-nav";

  const visibleItems = allNavItems.filter(
    (item) => !item.managerOnly || role === "manager"
  );

  return (
    <nav className={navClassName} aria-label="Main">
      {visibleItems.map((item) => {
        const active = item.isActive(pathname);
        const className = active ? "nav-link active" : "nav-link";
        const NavIcon = item.Icon;

        return (
          <Link
            key={item.href}
            href={item.href as Route}
            className={className}
            onClick={onNavigate}
          >
            <NavIcon />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
