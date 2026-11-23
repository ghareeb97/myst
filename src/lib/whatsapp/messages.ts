import type { OrderStatus } from "@/lib/types";

/**
 * Customer WhatsApp messages for online-order status changes (mystudio-web PRD §5.6).
 *
 * Each message is a WhatsApp Business *template*: the text below must be submitted to the provider
 * word for word (category "Utility", language Arabic "ar") and approved before the API will send it.
 * {{1}}, {{2}}, … are filled from `params` in order. The wording matches the tracking page on the website
 * (استلمنا طلبك · بنجهّزه · جاهز تستلمه / خرج للتوصيل · اتسلّم). See docs/WHATSAPP.md.
 */
export type MessageEvent = "in_progress" | "ready" | "delivered" | "cancelled";

export type StatusTemplate = { name: string; text: string };

export const STATUS_TEMPLATES = {
  order_in_progress: {
    name: "order_in_progress",
    text: "أهلاً {{1}}، بنجهّز طلبك {{2}} دلوقتي في ماي ستوديو. هنبعتلك رسالة أول ما يجهز.",
  },
  order_ready_pickup: {
    name: "order_ready_pickup",
    text:
      "أهلاً {{1}}، طلبك {{2}} جاهز تستلمه من ماي ستوديو: 47 شارع عمر لطفي، كامب شيزار، قدام محطة الترام. " +
      "مفتوح من 9:30 ص لـ 10 م. الإجمالي {{3}} ج.م تدفعه وانت بتستلم.",
  },
  order_out_for_delivery: {
    name: "order_out_for_delivery",
    text: "أهلاً {{1}}، طلبك {{2}} خرج للتوصيل. الإجمالي {{3}} ج.م تدفعه عند الاستلام.",
  },
  order_delivered: {
    name: "order_delivered",
    text: "أهلاً {{1}}، طلبك {{2}} اتسلّم. شكراً إنك اخترت ماي ستوديو، مستنيينك تاني.",
  },
  order_cancelled: {
    name: "order_cancelled",
    text: "أهلاً {{1}}، طلبك {{2}} اتلغى. لو عندك أي سؤال رد على الرسالة دي.",
  },
} as const satisfies Record<string, StatusTemplate>;

export type OrderForMessage = {
  code: string;
  customer_name: string;
  customer_phone: string;
  delivery_method: "pickup" | "delivery";
  total: number;
};

export type StatusMessage = {
  event: MessageEvent;
  template: string;
  language: "ar";
  params: string[];
  body: string;
};

/** Fill {{n}} slots (1-based) with params; unknown slots are left as they are. */
export function renderTemplate(text: string, params: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (slot, n: string) => params[Number(n) - 1] ?? slot);
}

/** 285 -> "285", 87.5 -> "87.50": whole pounds without decimals, like the website. */
export function formatAmount(total: number): string {
  return Number.isInteger(total) ? String(total) : total.toFixed(2);
}

/** First name only: friendlier, and keeps a long full name from crowding the message. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}

/**
 * Egyptian mobile number in international form without "+" (what WhatsApp APIs and wa.me expect),
 * or null if it isn't one. Accepts the forms submit_order stores (01xxxxxxxxx) and a few messy ones.
 */
export function toWhatsAppNumber(phone: string): string | null {
  const ascii = phone.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  let digits = ascii.replace(/\D/g, "");
  if (digits.startsWith("0020")) digits = digits.slice(2);
  if (/^01[0125]\d{8}$/.test(digits)) return `2${digits}`;
  if (/^201[0125]\d{8}$/.test(digits)) return digits;
  return null;
}

/** The message for an order that just moved to `status`, or null when that move doesn't text the customer. */
export function statusMessage(order: OrderForMessage, status: OrderStatus): StatusMessage | null {
  const name = firstName(order.customer_name);
  const amount = formatAmount(order.total);
  let template: StatusTemplate;
  let params: string[];

  switch (status) {
    case "in_progress":
      template = STATUS_TEMPLATES.order_in_progress;
      params = [name, order.code];
      break;
    case "ready":
      template =
        order.delivery_method === "delivery" ? STATUS_TEMPLATES.order_out_for_delivery : STATUS_TEMPLATES.order_ready_pickup;
      params = [name, order.code, amount];
      break;
    case "delivered":
      template = STATUS_TEMPLATES.order_delivered;
      params = [name, order.code];
      break;
    case "cancelled":
      template = STATUS_TEMPLATES.order_cancelled;
      params = [name, order.code];
      break;
    default:
      // "new" is the website's own confirmation screen; no message.
      return null;
  }

  return { event: status, template: template.name, language: "ar", params, body: renderTemplate(template.text, params) };
}

/** wa.me link that opens WhatsApp with the message ready to send, for staff to send by hand. */
export function manualSendLink(toPhone: string, body: string): string {
  return `https://wa.me/${toPhone}?text=${encodeURIComponent(body)}`;
}
