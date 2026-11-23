import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/lib/types";
import { statusMessage, toWhatsAppNumber, type OrderForMessage } from "@/lib/whatsapp/messages";
import { getWhatsAppProvider, type WhatsAppProvider } from "@/lib/whatsapp/provider";

export type NotifyOutcome =
  | { status: "none" }
  | { status: "duplicate" }
  | { status: "sent" | "logged" | "failed"; outboxId: string | null };

/**
 * Queue and send the customer's WhatsApp message for an order that just moved to `status`.
 *
 * Runs after update_order_status has committed and never throws: a messaging problem must not undo or
 * block the status change at the counter. Every attempt is stored in whatsapp_outbox first, so nothing is
 * lost if the provider is down, and the unique (order_id, event) key means each event texts the customer
 * at most once however many times the button is pressed.
 *
 * `admin` must be the service-role client (the outbox has no insert grant for staff sessions).
 */
export async function notifyOrderStatus(
  admin: SupabaseClient,
  orderId: string,
  status: OrderStatus,
  actorId: string,
  provider: WhatsAppProvider = getWhatsAppProvider()
): Promise<NotifyOutcome> {
  try {
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("code, customer_name, customer_phone, delivery_method, total")
      .eq("id", orderId)
      .single();
    if (orderError || !order) throw new Error(orderError?.message ?? "Order not found.");

    const message = statusMessage({ ...(order as OrderForMessage), total: Number(order.total) }, status);
    if (!message) return { status: "none" };

    const to = toWhatsAppNumber(order.customer_phone);
    const { data: inserted, error: insertError } = await admin
      .from("whatsapp_outbox")
      .upsert(
        {
          order_id: orderId,
          event: message.event,
          // An unusable number is kept as typed (the row is marked failed) so staff can see why.
          to_phone: to ?? (String(order.customer_phone).slice(0, 32) || "?"),
          template: message.template,
          language: message.language,
          params: message.params,
          body: message.body,
          status: to ? "pending" : "failed",
          error: to ? null : "Customer phone is not an Egyptian mobile number.",
          provider: provider.name,
          created_by: actorId,
        },
        { onConflict: "order_id,event", ignoreDuplicates: true }
      )
      .select("id");
    if (insertError) throw new Error(insertError.message);
    const outboxId = inserted?.[0]?.id as string | undefined;
    if (!outboxId) return { status: "duplicate" };
    if (!to) return { status: "failed", outboxId };

    const result = await provider
      .send({ to, template: message.template, language: message.language, params: message.params, body: message.body })
      .catch((err: unknown) => ({ status: "failed" as const, error: err instanceof Error ? err.message : String(err) }));

    await admin
      .from("whatsapp_outbox")
      .update({
        status: result.status,
        attempts: 1,
        provider_message_id: result.status === "sent" ? result.providerMessageId : null,
        error: result.status === "failed" ? result.error.slice(0, 500) : null,
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", outboxId);

    return { status: result.status, outboxId };
  } catch (err) {
    console.error("[whatsapp] Could not queue the status message:", err instanceof Error ? err.message : err);
    return { status: "failed", outboxId: null };
  }
}
