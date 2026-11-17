import type { OrderStatus } from "@/lib/types";

export const ORDER_STATUSES: OrderStatus[] = ["new", "in_progress", "ready", "delivered", "cancelled"];

const FLOW: OrderStatus[] = ["new", "in_progress", "ready", "delivered"];

export function orderStatusLabel(status: OrderStatus, deliveryMethod?: "pickup" | "delivery"): string {
  switch (status) {
    case "new":
      return "New";
    case "in_progress":
      return "In progress";
    case "ready":
      return deliveryMethod === "delivery" ? "Out for delivery" : "Ready for pickup";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
  }
}

export function orderStatusChip(status: OrderStatus): string {
  if (status === "new") return "chip accent";
  if (status === "ready") return "chip warning";
  if (status === "delivered") return "chip success";
  if (status === "cancelled") return "chip danger";
  return "chip";
}

/**
 * Statuses an order can move to, mirroring update_order_status in the database:
 * forward only (skipping allowed), cancel any time before delivery.
 */
export function nextStatuses(current: OrderStatus): OrderStatus[] {
  if (current === "delivered" || current === "cancelled") return [];
  const idx = FLOW.indexOf(current);
  return [...FLOW.slice(idx + 1), "cancelled"];
}

/** File name inside the zip: 01_10x15_x2_beach.jpg, so production can sort and see size and copies. */
export function zipEntryName(index: number, sizeCm: string, quantity: number, fileName: string | null, path: string): string {
  const base = (fileName ?? path.split("/").pop() ?? "photo").replace(/[\\/:*?"<>|]+/g, "_");
  return `${String(index + 1).padStart(2, "0")}_${sizeCm}_x${quantity}_${base}`;
}
