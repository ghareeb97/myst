import type { Role } from "@/lib/types";

export function canManageProducts(role: Role): boolean {
  return role === "manager";
}

export function canCreateInvoices(role: Role): boolean {
  return role === "manager" || role === "sales";
}

export function canVoidInvoices(role: Role): boolean {
  return role === "manager";
}

export function canEditInvoicePayments(role: Role): boolean {
  return role === "manager";
}
