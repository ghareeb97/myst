export type Role = "manager" | "supervisor" | "sales";

export type PaymentStatus = "paid" | "partially_paid" | "unpaid";

export type ProductStatus = "active" | "inactive";

export type InvoiceStatus = "confirmed" | "void";

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  sale_price: number;
  cost_price: number | null;
  current_stock: number;
  low_stock_threshold: number | null;
  status: ProductStatus;
  is_digital: boolean;
};

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  email?: string;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  created_at: string;
  created_by: string;
  customer_name: string | null;
  customer_phone: string | null;
  reference_number: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: PaymentStatus;
  status: InvoiceStatus;
  voided_at: string | null;
  voided_by: string | null;
};
