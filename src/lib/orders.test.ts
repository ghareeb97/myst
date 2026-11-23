import { describe, expect, it } from "vitest";
import { canConfirmOrders, canHandleOrders } from "@/lib/authz";
import { nextStatuses, orderItemLabel, orderStatusLabel, summarizeOrderItems, zipEntryName, zipItemTag } from "@/lib/orders";

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
