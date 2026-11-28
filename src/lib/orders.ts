import type { GiftDesign, GiftDesignPhoto, OrderStatus } from "@/lib/types";

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

type ItemCount = { kind?: "print" | "gift" | null; quantity: number };

/** "3 photos (5 prints) · 2 gifts" for the orders list; kinds the order doesn't have are left out. */
export function summarizeOrderItems(items: ItemCount[]): string {
  const prints = items.filter((i) => (i.kind ?? "print") === "print");
  const giftPieces = items.filter((i) => i.kind === "gift").reduce((s, i) => s + i.quantity, 0);
  const parts: string[] = [];
  if (prints.length || !giftPieces) {
    const copies = prints.reduce((s, i) => s + i.quantity, 0);
    parts.push(`${prints.length} ${prints.length === 1 ? "photo" : "photos"} (${copies} ${copies === 1 ? "print" : "prints"})`);
  }
  if (giftPieces) parts.push(`${giftPieces} ${giftPieces === 1 ? "gift" : "gifts"}`);
  return parts.join(" · ");
}

/** What a line is, for staff: "Print 10 × 15 cm" or the gift's product name. */
export function orderItemLabel(item: { kind?: "print" | "gift" | null; size_cm: string | null; gift_slug?: string | null }, productName?: string | null): string {
  if (item.kind === "gift") return productName ?? item.gift_slug ?? "Gift";
  return `Print ${(item.size_cm ?? "").replace("x", " × ")} cm`;
}

/** The middle part of a zip entry name: the print size, or gift-<slug> for gifts. */
export const zipItemTag = (item: { kind?: "print" | "gift" | null; size_cm: string | null; gift_slug?: string | null }) =>
  item.kind === "gift" ? `gift-${item.gift_slug ?? "item"}` : (item.size_cm ?? "print");

const FONT_LABELS: Record<string, string> = { cairo: "Cairo", amiri: "Amiri", ruqaa: "Ruqaa" };

/** "quad · Amiri · #7d582b · white-mug r1": layout, text font and color (when there is text), template and revision. */
export function designSummary(design: GiftDesign | null | undefined): string {
  if (!design) return "";
  const parts: string[] = [design.layout];
  if (design.text) parts.push(FONT_LABELS[design.text.font] ?? design.text.font, design.text.color);
  parts.push(`${design.template} r${design.rev}`);
  return parts.join(" · ");
}

/** The customer's original photos in a design, in slot order. */
export function designPhotos(design: GiftDesign | null | undefined): GiftDesignPhoto[] {
  return [...(design?.photos ?? [])].sort((a, b) => a.slot - b.slot);
}

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_");
const lineNo = (index: number) => String(index + 1).padStart(2, "0");

/** Zip entry for a designed gift's rendered print file: 01_gift-white-mug_x2_design.jpg. */
export function zipDesignName(index: number, tag: string, quantity: number, path: string): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(path)?.[1]?.toLowerCase() ?? "jpg";
  return `${lineNo(index)}_${tag}_x${quantity}_design.${ext}`;
}

/** Zip entry for an original photo of a design: 01_gift-white-mug_original-2_beach.jpg (K = slot + 1). */
export function zipOriginalName(index: number, tag: string, slot: number, fileName: string | null, path: string): string {
  const base = safeName(fileName ?? path.split("/").pop() ?? "photo");
  return `${lineNo(index)}_${tag}_original-${slot + 1}_${base}`;
}
