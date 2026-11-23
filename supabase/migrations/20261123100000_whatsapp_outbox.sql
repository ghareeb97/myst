-- WhatsApp status messages to online-order customers (mystudio-web PRD §5.6).
--
-- Every message staff trigger by changing an order's status is stored here first (an outbox), then handed
-- to the configured provider. Until a WhatsApp Business provider is connected the app uses a "log only"
-- provider: rows end as 'logged' and staff can send the same text by hand from the order page.
--
-- Self-contained: a new table only. Writes come from the myst server with the service role; active staff
-- can read (the order page shows the message log). Nothing is exposed to anon.

create table public.whatsapp_outbox (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete cascade,
  -- The status change that produced the message. One message per order and event, so a double click or
  -- a retried request never texts the customer twice.
  event               text not null check (event in ('in_progress', 'ready', 'delivered', 'cancelled')),
  -- Customer number in international form without "+", e.g. 201012345678 (or the raw phone when it's
  -- not a usable mobile number; that row is marked failed).
  to_phone            text not null check (char_length(to_phone) between 1 and 32),
  -- Approved template name at the provider, its language, and the values for its {{1}}, {{2}}, … slots.
  template            text not null,
  language            text not null default 'ar',
  params              jsonb not null default '[]'::jsonb check (jsonb_typeof(params) = 'array'),
  -- The rendered Arabic text, exactly what the customer receives (and what staff send by hand).
  body                text not null,
  status              text not null default 'pending' check (status in ('pending', 'sent', 'logged', 'failed')),
  provider            text,
  provider_message_id text,
  error               text,
  attempts            integer not null default 0 check (attempts >= 0),
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  unique (order_id, event)
);

comment on table public.whatsapp_outbox is
  'Customer WhatsApp messages for online-order status changes. Written by the myst server (service role); readable by active staff.';

create index whatsapp_outbox_order_idx on public.whatsapp_outbox (order_id, created_at);
-- For a future retry job: find what still needs sending.
create index whatsapp_outbox_unsent_idx on public.whatsapp_outbox (created_at) where status in ('pending', 'failed');

alter table public.whatsapp_outbox enable row level security;

create policy "whatsapp_outbox_read_staff" on public.whatsapp_outbox
  for select to authenticated
  using (public.current_user_role() is not null);

revoke all on public.whatsapp_outbox from public, anon, authenticated;
grant select on public.whatsapp_outbox to authenticated;
grant all on public.whatsapp_outbox to service_role;
