import { describe, expect, it } from "vitest";
import {
  canCreateInvoices,
  canEditInvoicePayments,
  canManageProducts,
  canVoidInvoices
} from "@/lib/authz";

describe("RBAC helpers", () => {
  it("manager can manage products", () => {
    expect(canManageProducts("manager")).toBe(true);
    expect(canManageProducts("sales")).toBe(false);
  });

  it("sales can create invoices", () => {
    expect(canCreateInvoices("sales")).toBe(true);
  });

  it("only manager can edit payments and void", () => {
    expect(canEditInvoicePayments("manager")).toBe(true);
    expect(canEditInvoicePayments("sales")).toBe(false);
    expect(canVoidInvoices("manager")).toBe(true);
    expect(canVoidInvoices("sales")).toBe(false);
  });
});
