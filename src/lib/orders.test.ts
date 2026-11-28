import { describe, expect, it } from "vitest";
import { canConfirmOrders, canHandleOrders } from "@/lib/authz";
import {
  designPhotos,
  designSummary,
  nextStatuses,
  orderItemLabel,
  orderStatusLabel,
  summarizeOrderItems,
  zipDesignName,
  zipEntryName,
  zipItemTag,
  zipOriginalName,
} from "@/lib/orders";
import type { GiftDesign } from "@/lib/types";

describe("online order rules", () => {
  it("moves forward only and allows cancel before delivery", () => {
    expect(nextStatuses("new")).toEqual(["in_progress", "ready", "delivered", "cancelled"]);
    expect(nextStatuses("ready")).toEqual(["delivered", "cancelled"]);
    expect(nextStatuses("delivered")).toEqual([]);
    expect(nextStatuses("cancelled")).toEqual([]);
  });

  it("labels ready by delivery method", () => {
    expect(orderStatusLabel("ready", "pickup")).toBe("Ready for pickup");
    expect(orderStatusLabel("ready", "delivery")).toBe("Out for delivery");
  });

  it("builds sortable zip entry names", () => {
    expect(zipEntryName(0, "10x15", 2, "beach.jpg", "pending/x/0-beach.jpg")).toBe("01_10x15_x2_beach.jpg");
    expect(zipEntryName(11, "30x40", 1, null, "pending/x/11-a.png")).toBe("12_30x40_x1_11-a.png");
    expect(zipEntryName(2, "13x18", 1, 'bad/na:me?.jpg', "p")).toBe("03_13x18_x1_bad_na_me_.jpg");
  });

  it("lets every staff role handle and confirm orders", () => {
    for (const role of ["manager", "supervisor", "sales"] as const) {
      expect(canHandleOrders(role)).toBe(true);
      expect(canConfirmOrders(role)).toBe(true);
    }
  });
});

describe("gift lines", () => {
  it("summarizes prints and gifts for the list", () => {
    expect(summarizeOrderItems([{ quantity: 2 }, { kind: "print", quantity: 1 }])).toBe("2 photos (3 prints)");
    expect(summarizeOrderItems([{ kind: "print", quantity: 1 }])).toBe("1 photo (1 print)");
    expect(
      summarizeOrderItems([
        { kind: "print", quantity: 2 },
        { kind: "gift", quantity: 1 },
        { kind: "gift", quantity: 2 },
      ])
    ).toBe("1 photo (2 prints) · 3 gifts");
    expect(summarizeOrderItems([{ kind: "gift", quantity: 1 }])).toBe("1 gift");
    expect(summarizeOrderItems([])).toBe("0 photos (0 prints)");
  });

  it("labels lines and tags zip entries", () => {
    expect(orderItemLabel({ kind: "print", size_cm: "10x15" })).toBe("Print 10 × 15 cm");
    expect(orderItemLabel({ kind: "gift", size_cm: null, gift_slug: "magic-mug" }, "Magic mug")).toBe("Magic mug");
    expect(orderItemLabel({ kind: "gift", size_cm: null, gift_slug: "magic-mug" })).toBe("magic-mug");
    expect(zipItemTag({ kind: "gift", size_cm: null, gift_slug: "magic-mug" })).toBe("gift-magic-mug");
    expect(zipEntryName(0, zipItemTag({ kind: "print", size_cm: "10x15" }), 2, "a.jpg", "p")).toBe("01_10x15_x2_a.jpg");
  });
});

describe("gift designs", () => {
  const photo = (slot: number, name: string | null) => ({
    slot,
    path: `pending/u/o-${slot}.jpg`,
    file_name: name,
    w: 100,
    h: 100,
    crop: { x: 0, y: 0, s: 1 },
  });
  const design: GiftDesign = {
    v: 1,
    template: "white-mug",
    rev: 1,
    layout: "quad",
    photos: [photo(2, "c.jpg"), photo(0, "a.jpg"), photo(1, null)],
    text: { font: "amiri", color: "#7d582b" },
  };

  it("summarizes a design for staff", () => {
    expect(designSummary(design)).toBe("quad · Amiri · #7d582b · white-mug r1");
    expect(designSummary({ ...design, layout: "single", text: null, rev: 3 })).toBe("single · white-mug r3");
    expect(designSummary(null)).toBe("");
    expect(designSummary(undefined)).toBe("");
  });

  it("lists the originals in slot order", () => {
    expect(designPhotos(design).map((p) => p.slot)).toEqual([0, 1, 2]);
    expect(designPhotos(null)).toEqual([]);
  });

  it("names the print file and the originals in the zip", () => {
    const tag = zipItemTag({ kind: "gift", size_cm: null, gift_slug: "white-mug" });
    expect(zipDesignName(0, tag, 2, "pending/u/g-render.jpg")).toBe("01_gift-white-mug_x2_design.jpg");
    expect(zipDesignName(9, tag, 1, "pending/u/g-render.PNG")).toBe("10_gift-white-mug_x1_design.png");
    expect(zipDesignName(0, tag, 1, "pending/u/render")).toBe("01_gift-white-mug_x1_design.jpg");
    expect(zipOriginalName(0, tag, 1, "beach.jpg", "pending/u/o-1.jpg")).toBe("01_gift-white-mug_original-2_beach.jpg");
    expect(zipOriginalName(0, tag, 0, null, "pending/u/o-0.jpg")).toBe("01_gift-white-mug_original-1_o-0.jpg");
    expect(zipOriginalName(0, tag, 3, "a\\b:c.jpg", "p")).toBe("01_gift-white-mug_original-4_a_b_c.jpg");
  });
});
