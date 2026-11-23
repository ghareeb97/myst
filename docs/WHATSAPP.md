# WhatsApp status messages to customers

Online-order customers should hear from us when their order moves on (mystudio-web PRD §5.6), so they don't have to keep checking the tracking page. This file covers what is built, how it works today without a WhatsApp provider, and what is needed to switch real sending on.

## What happens today

1. Staff press **Mark in progress / ready / delivered** or **Cancel order** on `/dashboard/orders/[id]`.
2. `POST /api/orders/[id]/status` calls `update_order_status` (unchanged). Once that succeeds, it calls `notifyOrderStatus` (`src/lib/whatsapp/notify.ts`).
3. `notifyOrderStatus` builds the Arabic message (`src/lib/whatsapp/messages.ts`) and stores it in **`public.whatsapp_outbox`**. There is one row per order and event, so a double click never texts the customer twice. It then hands the message to the configured provider and records the result on the row.
4. With no provider configured, the **log-only** provider (`src/lib/whatsapp/provider.ts`) sends nothing. It writes a log line with a masked number, and the row ends as `logged`.
5. The order page has a **Customer messages** card listing each message. For `logged` or `failed` rows, a **Send on WhatsApp** button opens `wa.me/<customer>` with the same text, so staff can send it by hand from the studio phone until the API is connected. The toast after a status change says so.

A messaging problem (provider down, bad phone, database error) never blocks or undoes the status change. The row is marked `failed` with the reason, and the request still succeeds.

No message is sent for a **new** order; the website's confirmation and tracking page cover that moment.

## Messages (templates to get approved)

WhatsApp only lets a business start a conversation with a pre-approved **template**. Submit each of these exactly as written. Use category **Utility** and language **Arabic (`ar`)**. `{{1}}` is the customer's first name, `{{2}}` the order code (e.g. `MS-ABC12345`), and `{{3}}` the total in pounds. The source of truth is `STATUS_TEMPLATES` in `src/lib/whatsapp/messages.ts`; keep the two in sync.

| Template name | Sent when | Text |
|---|---|---|
| `order_in_progress` | Marked in progress | أهلاً {{1}}، بنجهّز طلبك {{2}} دلوقتي في ماي ستوديو. هنبعتلك رسالة أول ما يجهز. |
| `order_ready_pickup` | Marked ready, pickup order | أهلاً {{1}}، طلبك {{2}} جاهز تستلمه من ماي ستوديو: 47 شارع عمر لطفي، كامب شيزار، قدام محطة الترام. مفتوح من 9:30 ص لـ 10 م. الإجمالي {{3}} ج.م تدفعه وانت بتستلم. |
| `order_out_for_delivery` | Marked ready, delivery order | أهلاً {{1}}، طلبك {{2}} خرج للتوصيل. الإجمالي {{3}} ج.م تدفعه عند الاستلام. |
| `order_delivered` | Marked delivered | أهلاً {{1}}، طلبك {{2}} اتسلّم. شكراً إنك اخترت ماي ستوديو، مستنيينك تاني. |
| `order_cancelled` | Cancelled | أهلاً {{1}}، طلبك {{2}} اتلغى. لو عندك أي سؤال رد على الرسالة دي. |

Optional, once the website has its production domain: add a **URL button** "تابع الطلب" to each template, with the dynamic suffix `/order/{{1}}` = the order code. The provider then needs the code passed as a button parameter as well.

The ready-for-pickup text has the address and opening hours written into it. If either changes, the template must be edited and approved again.

## Switching real sending on: what the owner needs to decide and provide

1. **Choose a provider.**
   - **Meta WhatsApp Cloud API** (direct): no middleman fee, but you set up Meta Business yourself.
   - **A BSP** such as Twilio, 360dialog or Infobip: easier onboarding and support, but adds a per-message fee.
2. **A WhatsApp Business account** on a phone number that is *not* in use in the WhatsApp app. Moving the studio's current WhatsApp number to the API means it can no longer be used from the phone app. Many businesses use a second number for notifications.
3. **Meta Business verification** of My Studio (business documents). This is needed for normal sending limits.
4. **Approval of the five templates** above, in Arabic.
5. **Costs:** Meta charges per *utility* conversation (Egypt rates apply), plus BSP fees if one is used. Check current prices when signing up.
6. **Privacy:** the customer gives their number on the order form. Tell them on the form and the tracking page that "هنبعتلك على واتساب لما الطلب يجهز" (this is Batch 2 in `mystudio-web/docs/UX-PLAN.md`). Cover it in the privacy notice too.

## Switching real sending on: engineering steps

1. Add a provider class in `src/lib/whatsapp/` that implements `WhatsAppProvider` (`send(message) → { status: "sent", providerMessageId } | { status: "failed", error }`).
   - For the Cloud API, that is a `POST https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/messages` request with `type: "template"`, the template name and language, and `components: [{ type: "body", parameters: params.map(text => ({ type: "text", text })) }]`.
   - Give it unit tests with a mocked `fetch`, like `notify.test.ts`.
2. Register it in `getWhatsAppProvider` behind `WHATSAPP_PROVIDER=<name>`.
3. Add its secrets (for example `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`) as **server-only** env vars in Vercel. Never use the `NEXT_PUBLIC_` prefix.
4. Optional: add a delivery-status webhook route that updates `whatsapp_outbox` by `provider_message_id` (delivered or read), and a retry job for `failed` rows (the `whatsapp_outbox_unsent_idx` index is there for it).
5. Deploy with `WHATSAPP_PROVIDER` unset first. Check that rows appear as `logged`, then set it and test with a staff member's own number.

## Database

Migration `supabase/migrations/20261123100000_whatsapp_outbox.sql` adds the table only:
- RLS is on. Active staff can **read** (`current_user_role() is not null`).
- Only the service role (the myst server) can write.
- Anon has no access.
- It is self-contained: no existing function or policy is changed.

Production: apply it with the other pending migrations (`supabase db push` against the production project, by whoever owns the deploy).
