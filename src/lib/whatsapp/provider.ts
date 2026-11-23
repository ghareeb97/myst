/**
 * The seam between the outbox and whoever actually delivers WhatsApp messages.
 *
 * Today only the "log" provider exists: it records that a message would have gone out and sends nothing.
 * To go live, add a provider (Meta WhatsApp Cloud API, or a BSP such as Twilio) that implements
 * `WhatsAppProvider`, register it in `getWhatsAppProvider`, and set WHATSAPP_PROVIDER. See docs/WHATSAPP.md.
 */
export type OutgoingMessage = {
  /** International number without "+", e.g. 201012345678. */
  to: string;
  template: string;
  language: string;
  params: string[];
  /** Rendered text, for providers or logs that want it. Templates are sent by name + params. */
  body: string;
};

export type SendResult =
  | { status: "sent"; providerMessageId: string | null }
  | { status: "logged" }
  | { status: "failed"; error: string };

export interface WhatsAppProvider {
  readonly name: string;
  send(message: OutgoingMessage): Promise<SendResult>;
}

/** 201012345678 -> 2010•••••678, so server logs don't collect full customer numbers. */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return "•".repeat(phone.length);
  return `${phone.slice(0, 4)}${"•".repeat(phone.length - 7)}${phone.slice(-3)}`;
}

/** Sends nothing. The outbox row ends as "logged" and staff can send the text by hand from the order page. */
export class LogOnlyProvider implements WhatsAppProvider {
  readonly name = "log";

  constructor(private readonly log: (line: string) => void = (line) => console.info(line)) {}

  async send(message: OutgoingMessage): Promise<SendResult> {
    this.log(`[whatsapp:log-only] ${message.template} -> ${maskPhone(message.to)} (not sent: no provider configured)`);
    return { status: "logged" };
  }
}

/**
 * Provider from WHATSAPP_PROVIDER. Unset or "log" gives the log-only provider. An unknown value also falls
 * back to log-only (with a warning) so a typo can never break status changes at the counter.
 */
export function getWhatsAppProvider(env: Record<string, string | undefined> = process.env): WhatsAppProvider {
  const choice = (env.WHATSAPP_PROVIDER ?? "log").trim().toLowerCase();
  if (choice !== "log" && choice !== "") {
    console.warn(`[whatsapp] Unknown WHATSAPP_PROVIDER "${choice}"; messages will be logged, not sent.`);
  }
  return new LogOnlyProvider();
}
