export type Role = "manager" | "supervisor" | "sales";

export type PaymentStatus = "paid" | "partially_paid" | "unpaid";

export type ProductStatus = "active" | "inactive";

export type InvoiceStatus = "confirmed" | "void";

export type OrderStatus = "new" | "in_progress" | "ready" | "delivered" | "cancelled";

export type Order = {
  id: string;
  code: string;
  customer_name: string;
  customer_phone: string;
  delivery_method: "pickup" | "delivery";
  area: string | null;
  address: string | null;
  notes: string | null;
  payment_method: "pay_at_pickup" | "cash_on_delivery";
  status: OrderStatus;
  total: number;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  size_cm: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  file_path: string;
  file_name: string | null;
};

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
