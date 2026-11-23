import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { notifyOrderStatus } from "@/lib/whatsapp/notify";
import type { WhatsAppProvider } from "@/lib/whatsapp/provider";

type Row = Record<string, unknown>;

/** Just enough of the Supabase query builder for notifyOrderStatus, backed by in-memory tables. */
function fakeAdmin(order: Row | null) {
  const outbox: Row[] = [];
  const client = {
    from(table: string) {
      if (table === "orders") {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: order, error: order ? null : { message: "not found" } }) }) })
        };
      }
      return {
        upsert(row: Row) {
          return {
            select: async () => {
              if (outbox.some((r) => r.order_id === row.order_id && r.event === row.event)) return { data: [], error: null };
              const saved = { id: `row-${outbox.length + 1}`, ...row };
              outbox.push(saved);
              return { data: [{ id: saved.id }], error: null };
            }
          };
        },
        update(patch: Row) {
          return {
            eq: async (_col: string, id: string) => {
              Object.assign(outbox.find((r) => r.id === id)!, patch);
              return { error: null };
            }
          };
        }
      };
    }
  };
  return { admin: client as unknown as SupabaseClient, outbox };
}

const order = {
  code: "MS-TEST0001",
  customer_name: "منى أحمد",
  customer_phone: "01012345678",
  delivery_method: "pickup",
  total: "300.00"
};

const provider = (result: Awaited<ReturnType<WhatsAppProvider["send"]>> | Error): WhatsAppProvider & { calls: number } => ({
  name: "test",
  calls: 0,
  async send() {
    this.calls += 1;
    if (result instanceof Error) throw result;
    return result;
  }
});

describe("notifyOrderStatus", () => {
  it("stores the message, sends it once and records the result", async () => {
    const { admin, outbox } = fakeAdmin(order);
    const p = provider({ status: "logged" });
    expect(await notifyOrderStatus(admin, "o1", "ready", "staff1", p)).toEqual({ status: "logged", outboxId: "row-1" });
    expect(outbox[0]).toMatchObject({ event: "ready", to_phone: "201012345678", template: "order_ready_pickup", status: "logged", attempts: 1 });
    expect(String(outbox[0].body)).toContain("300 ج.م");

    // Same event again (double click, retried request): no second message.
    expect(await notifyOrderStatus(admin, "o1", "ready", "staff1", p)).toEqual({ status: "duplicate" });
    expect(p.calls).toBe(1);
  });

  it("does nothing for statuses without a message", async () => {
    const { admin, outbox } = fakeAdmin(order);
    expect(await notifyOrderStatus(admin, "o1", "new", "staff1", provider({ status: "logged" }))).toEqual({ status: "none" });
    expect(outbox).toHaveLength(0);
  });

  it("marks an unusable phone as failed without calling the provider", async () => {
    const { admin, outbox } = fakeAdmin({ ...order, customer_phone: "035913259" });
    const p = provider({ status: "logged" });
    const out = await notifyOrderStatus(admin, "o1", "in_progress", "staff1", p);
    expect(out.status).toBe("failed");
    expect(p.calls).toBe(0);
    expect(outbox[0]).toMatchObject({ status: "failed", to_phone: "035913259" });
  });

  it("never throws: provider errors and missing orders come back as failed", async () => {
    const { admin, outbox } = fakeAdmin(order);
    expect((await notifyOrderStatus(admin, "o1", "delivered", "staff1", provider(new Error("timeout")))).status).toBe("failed");
    expect(outbox[0]).toMatchObject({ status: "failed", error: "timeout" });

    const missing = fakeAdmin(null);
    expect(await notifyOrderStatus(missing.admin, "x", "ready", "staff1", provider({ status: "logged" }))).toEqual({
      status: "failed",
      outboxId: null
    });
  });

  it("records the provider message id when sent", async () => {
    const { admin, outbox } = fakeAdmin(order);
    await notifyOrderStatus(admin, "o1", "cancelled", "staff1", provider({ status: "sent", providerMessageId: "wamid.1" }));
    expect(outbox[0]).toMatchObject({ status: "sent", provider_message_id: "wamid.1" });
    expect(outbox[0].sent_at).toBeTruthy();
  });
});
