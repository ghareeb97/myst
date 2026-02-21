import type { Role } from "@/lib/types";

export function canManageProducts(role: Role): boolean {
  return role === "manager";
}

export function canCreateInvoices(role: Role): boolean {
  return role === "manager" || role === "supervisor" || role === "sales";
}

export function canVoidInvoices(role: Role): boolean {
  return role === "manager";
}

export function canEditInvoicePayments(role: Role): boolean {
  return role === "manager";
}

export function canDeleteInvoices(role: Role): boolean {
  return role === "manager";
}

export function canEditInvoiceInfo(role: Role): boolean {
  return role === "manager" || role === "supervisor";
}

export function canAddDiscount(role: Role): boolean {
  return role === "manager" || role === "supervisor";
}

export function canManageUsers(role: Role): boolean {
  return role === "manager";
}

export function canAccessManagerRoutes(role: Role): boolean {
  return role === "manager";
}

// Returns enforced date bounds for invoice queries.
// Returns null for manager (unrestricted).
// Cairo is UTC+2 year-round (no DST since 2011).
export function getInvoiceDateBounds(
  role: Role
): { from: string; to: string } | null {
  if (role === "manager") return null;

  const now = new Date();
  // Compute today in Cairo time (UTC+2)
  const cairoMs = now.getTime() + 2 * 60 * 60 * 1000;
  const cairoNow = new Date(cairoMs);
  const today = cairoNow.toISOString().slice(0, 10); // YYYY-MM-DD

  if (role === "sales") {
    return { from: today, to: today };
  }

  // supervisor: last 7 days
  const sevenDaysAgo = new Date(cairoMs - 6 * 24 * 60 * 60 * 1000);
  const fromDate = sevenDaysAgo.toISOString().slice(0, 10);
  return { from: fromDate, to: today };
}

// Clamp a user-supplied date string to the allowed bounds.
// Returns the clamped value (or the bound if the supplied value exceeds it).
export function clampDate(
  supplied: string,
  bound: string,
  direction: "min" | "max"
): string {
  if (!supplied) return bound;
  if (direction === "min") return supplied < bound ? bound : supplied;
  return supplied > bound ? bound : supplied;
}
