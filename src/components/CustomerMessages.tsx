import { formatDateTime } from "@/lib/format";
import { manualSendLink, type MessageEvent } from "@/lib/whatsapp/messages";

export type OutboxRow = {
  id: string;
  event: MessageEvent;
  to_phone: string;
  body: string;
  status: "pending" | "sent" | "logged" | "failed";
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

const EVENT_LABEL: Record<MessageEvent, { pickup: string; delivery: string }> = {
  in_progress: { pickup: "In progress", delivery: "In progress" },
  ready: { pickup: "Ready for pickup", delivery: "Out for delivery" },
  delivered: { pickup: "Delivered", delivery: "Delivered" },
  cancelled: { pickup: "Cancelled", delivery: "Cancelled" },
};

const STATUS_CHIP: Record<OutboxRow["status"], { className: string; label: string }> = {
  sent: { className: "chip success", label: "Sent" },
  logged: { className: "chip warning", label: "Not sent: WhatsApp not connected" },
  failed: { className: "chip danger", label: "Failed" },
  pending: { className: "chip", label: "Sending" },
};

/**
 * The WhatsApp messages this order's status changes produced. Until a provider is connected every row is
 * "logged", and the Send button opens WhatsApp with the same Arabic text so staff can send it by hand.
 */
export function CustomerMessages({ rows, deliveryMethod }: { rows: OutboxRow[]; deliveryMethod: "pickup" | "delivery" }) {
  return (
    <section className="card stack reveal">
      <h2>Customer messages</h2>
      {rows.length === 0 ? (
        <p className="help-text">
          The customer gets a WhatsApp message when you mark the order in progress, ready, delivered or cancelled.
        </p>
      ) : (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((m) => {
            const chip = STATUS_CHIP[m.status];
            const canSendByHand = (m.status === "logged" || m.status === "failed") && /^\d{8,15}$/.test(m.to_phone);
            return (
              <li key={m.id} className="stack" style={{ gap: 6 }}>
                <div className="order-actions" style={{ alignItems: "center" }}>
                  <strong>{EVENT_LABEL[m.event][deliveryMethod]}</strong>
                  <span className={chip.className}>{chip.label}</span>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {formatDateTime(m.sent_at ?? m.created_at)}
                  </span>
                </div>
                <p className="help-text" dir="rtl" lang="ar" style={{ margin: 0 }}>
                  {m.body}
                </p>
                {m.status === "failed" && m.error ? (
                  <p className="help-text" style={{ margin: 0 }}>
                    {m.error}
                  </p>
                ) : null}
                {canSendByHand ? (
                  <a
                    className="btn sm"
                    style={{ alignSelf: "flex-start" }}
                    href={manualSendLink(m.to_phone, m.body)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Send on WhatsApp
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
