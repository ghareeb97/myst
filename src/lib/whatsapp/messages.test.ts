import { describe, expect, it } from "vitest";
import {
  STATUS_TEMPLATES,
  firstName,
  formatAmount,
  manualSendLink,
  renderTemplate,
  statusMessage,
  toWhatsAppNumber,
  type OrderForMessage
} from "@/lib/whatsapp/messages";
import { LogOnlyProvider, getWhatsAppProvider, maskPhone } from "@/lib/whatsapp/provider";

const order: OrderForMessage = {
  code: "MS-ABC12345",
  customer_name: "  منى أحمد علي ",
  customer_phone: "01012345678",
  delivery_method: "pickup",
  total: 285
};

describe("statusMessage", () => {
  it("sends nothing for a new order (the website confirms it)", () => {
    expect(statusMessage(order, "new")).toBeNull();
  });

  it("fills name and code for in progress", () => {
    const m = statusMessage(order, "in_progress")!;
    expect(m.template).toBe("order_in_progress");
    expect(m.params).toEqual(["منى", "MS-ABC12345"]);
    expect(m.body).toContain("بنجهّز طلبك MS-ABC12345");
    expect(m.body).not.toMatch(/\{\{\d\}\}/);
  });

  it("uses the pickup or delivery wording for ready, with the total", () => {
    const pickup = statusMessage(order, "ready")!;
    expect(pickup.template).toBe("order_ready_pickup");
    expect(pickup.body).toContain("جاهز تستلمه");
    expect(pickup.body).toContain("285 ج.م");

    const delivery = statusMessage({ ...order, delivery_method: "delivery", total: 87.5 }, "ready")!;
    expect(delivery.template).toBe("order_out_for_delivery");
    expect(delivery.body).toContain("خرج للتوصيل");
    expect(delivery.params[2]).toBe("87.50");
  });

  it("covers delivered and cancelled", () => {
    expect(statusMessage(order, "delivered")!.event).toBe("delivered");
    expect(statusMessage(order, "cancelled")!.body).toContain("اتلغى");
  });

  it("every template's slots are filled by the params it is sent with", () => {
    for (const status of ["in_progress", "ready", "delivered", "cancelled"] as const) {
      for (const method of ["pickup", "delivery"] as const) {
        const m = statusMessage({ ...order, delivery_method: method }, status)!;
        const text = Object.values(STATUS_TEMPLATES).find((t) => t.name === m.template)!.text;
        const slots = new Set(text.match(/\{\{\d+\}\}/g));
        expect(slots.size).toBe(m.params.length);
      }
    }
  });
});

describe("helpers", () => {
  it("renderTemplate leaves unknown slots alone", () => {
    expect(renderTemplate("{{1}} و {{3}}", ["أ"])).toBe("أ و {{3}}");
  });

  it("formatAmount drops .00", () => {
    expect(formatAmount(300)).toBe("300");
    expect(formatAmount(12.3)).toBe("12.30");
  });

  it("firstName handles extra spaces and single names", () => {
    expect(firstName("  منى   أحمد ")).toBe("منى");
    expect(firstName("Ali")).toBe("Ali");
  });

  it("toWhatsAppNumber accepts Egyptian mobiles in messy forms and rejects the rest", () => {
    expect(toWhatsAppNumber("01012345678")).toBe("201012345678");
    expect(toWhatsAppNumber("+20 115 123 4567")).toBe("201151234567");
    expect(toWhatsAppNumber("0020 1212345678")).toBe("201212345678");
    expect(toWhatsAppNumber("٠١٥١٢٣٤٥٦٧٨")).toBe("201512345678");
    expect(toWhatsAppNumber("035913259")).toBeNull();
    expect(toWhatsAppNumber("01312345678")).toBeNull();
    expect(toWhatsAppNumber("")).toBeNull();
  });

  it("manualSendLink encodes the Arabic text", () => {
    const link = manualSendLink("201012345678", "أهلاً منى");
    expect(link.startsWith("https://wa.me/201012345678?text=")).toBe(true);
    expect(decodeURIComponent(link.split("text=")[1])).toBe("أهلاً منى");
  });
});

describe("provider", () => {
  it("log-only sends nothing, reports logged and masks the number", async () => {
    const lines: string[] = [];
    const result = await new LogOnlyProvider((l) => lines.push(l)).send({
      to: "201012345678",
      template: "order_ready_pickup",
      language: "ar",
      params: [],
      body: ""
    });
    expect(result).toEqual({ status: "logged" });
    expect(lines[0]).toContain("2010•••••678");
    expect(lines[0]).not.toContain("201012345678");
  });

  it("maskPhone keeps only the edges", () => {
    expect(maskPhone("201012345678")).toBe("2010•••••678");
    expect(maskPhone("12345")).toBe("•••••");
  });

  it("defaults to log-only, including for unknown values", () => {
    expect(getWhatsAppProvider({}).name).toBe("log");
    expect(getWhatsAppProvider({ WHATSAPP_PROVIDER: "LOG" }).name).toBe("log");
    expect(getWhatsAppProvider({ WHATSAPP_PROVIDER: "carrier-pigeon" }).name).toBe("log");
  });
});
