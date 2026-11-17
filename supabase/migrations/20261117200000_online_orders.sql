-- Online orders from the public website (mystudio-web), Phase 2 slice 1: print orders.
-- The website only ever uses the anon key and reaches the database through the three
-- anon RPCs below (online_print_prices, submit_order, order_status_public).
-- Staff handle orders in myst; confirming an order turns it into a normal invoice via create_invoice.

-- ── Lock down function execution ──────────────────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default, which includes anon. Once the anon key
-- ships in the public website, every staff RPC would be callable by anyone. Revoke that,
-- and re-grant to the roles myst actually uses so staff behaviour is unchanged.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ── Enum ──────────────────────────────────────────────────────────────────────
create type public.order_status_enum as enum ('new', 'in_progress', 'ready', 'delivered', 'cancelled');

-- ── Print-size products (prices from mystudio-web data/catalog.json, "print" column) ──
-- is_digital = true so prints never touch stock. Managers edit prices in Products as usual.
insert into public.products (sku, name, category, sale_price, current_stock, status, is_digital)
values
  ('PRINT-10X15', 'Print 10×15 cm', 'Prints',  25, 0, 'active', true),
  ('PRINT-13X18', 'Print 13×18 cm', 'Prints',  35, 0, 'active', true),
  ('PRINT-15X21', 'Print 15×21 cm', 'Prints',  40, 0, 'active', true),
  ('PRINT-20X30', 'Print 20×30 cm', 'Prints',  75, 0, 'active', true),
  ('PRINT-30X40', 'Print 30×40 cm', 'Prints', 150, 0, 'active', true),
  ('PRINT-40X50', 'Print 40×50 cm', 'Prints', 300, 0, 'active', true),
  ('PRINT-50X60', 'Print 50×60 cm', 'Prints', 350, 0, 'active', true),
  ('PRINT-50X70', 'Print 50×70 cm', 'Prints', 500, 0, 'active', true)
on conflict (sku) do nothing;

-- ── Sizes offered online ──────────────────────────────────────────────────────
-- min_px_long_side ≈ 150 DPI on the long side; below it the website warns the photo will look soft.
create table public.online_print_sizes (
  size_cm          text primary key,
  product_id       uuid not null references public.products (id),
  sort             integer not null default 0,
  active           boolean not null default true,
  min_px_long_side integer not null check (min_px_long_side > 0)
);

insert into public.online_print_sizes (size_cm, product_id, sort, min_px_long_side)
select s.size_cm, p.id, s.sort, s.min_px
from (values
  ('10x15', 'PRINT-10X15', 1,  886),
  ('13x18', 'PRINT-13X18', 2, 1063),
  ('15x21', 'PRINT-15X21', 3, 1240),
  ('20x30', 'PRINT-20X30', 4, 1772),
  ('30x40', 'PRINT-30X40', 5, 2362),
  ('40x50', 'PRINT-40X50', 6, 2953),
  ('50x60', 'PRINT-50X60', 7, 3543),
  ('50x70', 'PRINT-50X70', 8, 4134)
) as s(size_cm, sku, sort, min_px)
join public.products p on p.sku = s.sku
on conflict (size_cm) do nothing;

-- ── Orders ────────────────────────────────────────────────────────────────────
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  upload_id         uuid not null unique,
  customer_name     text not null,
  customer_phone    text not null,
  delivery_method   text not null check (delivery_method in ('pickup', 'delivery')),
  area              text null,
  address           text null,
  notes             text null,
  payment_method    text not null check (payment_method in ('pay_at_pickup', 'cash_on_delivery')),
  status            public.order_status_enum not null default 'new',
  total             numeric(12, 2) not null check (total >= 0),
  invoice_id        uuid null references public.invoices (id) on delete set null,
  status_changed_by uuid null references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index orders_status_created_idx on public.orders (status, created_at desc);

create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  kind        text not null default 'print' check (kind in ('print')),
  size_cm     text not null,
  product_id  uuid not null references public.products (id),
  quantity    integer not null check (quantity between 1 and 50),
  unit_price  numeric(12, 2) not null check (unit_price >= 0),
  line_total  numeric(12, 2) not null check (line_total >= 0),
  file_path   text not null,
  file_name   text null,
  created_at  timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);

create table public.order_events (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders (id) on delete cascade,
  action     text not null,
  actor_id   uuid null references public.profiles (id),
  details    jsonb null,
  created_at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at);

-- ── RLS: active staff read, nobody writes directly (writes go through the RPCs) ────
-- "authenticated" alone is not enough: with public sign-up on, anyone holding the anon key
-- (now shipped in the public website) could register and read customer names, phones and photos.
-- current_user_role() is null unless the caller has an active row in profiles.
alter table public.online_print_sizes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

create policy "online_print_sizes_read_staff" on public.online_print_sizes for select to authenticated using (public.current_user_role() is not null);
create policy "orders_read_staff" on public.orders for select to authenticated using (public.current_user_role() is not null);
create policy "order_items_read_staff" on public.order_items for select to authenticated using (public.current_user_role() is not null);
create policy "order_events_read_staff" on public.order_events for select to authenticated using (public.current_user_role() is not null);

revoke all on public.online_print_sizes, public.orders, public.order_items, public.order_events from anon;
grant select on public.online_print_sizes, public.orders, public.order_items, public.order_events to authenticated;
grant all privileges on public.online_print_sizes, public.orders, public.order_items, public.order_events to service_role;

-- ── Storage: private bucket for customer photos ───────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-uploads', 'order-uploads', false, 31457280,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
on conflict (id) do nothing;

-- Anyone may upload, but only as pending/<uuid>/<file>. No anon read, list, overwrite or delete.
create policy "order_uploads_anon_insert" on storage.objects
for insert to anon
with check (
  bucket_id = 'order-uploads'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = 'pending'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

create policy "order_uploads_staff_read" on storage.objects
for select to authenticated
using (bucket_id = 'order-uploads' and public.current_user_role() is not null);

-- ── Helpers ───────────────────────────────────────────────────────────────────
-- 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), e.g. MS-7KQ2XH9P.
create or replace function public.generate_order_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code  text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := 'MS-';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.orders where code = v_code);
  end loop;
  return v_code;
end;
$$;

-- "+20 100 123 4567", "00201001234567", "201001234567" and "01001234567" all become 01001234567.
create or replace function public.normalize_eg_mobile(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if v_digits like '0020%' then
    v_digits := '0' || substr(v_digits, 5);
  elsif v_digits like '20%' and length(v_digits) = 12 then
    v_digits := '0' || substr(v_digits, 3);
  end if;
  if v_digits ~ '^01[0125][0-9]{8}$' then
    return v_digits;
  end if;
  return null;
end;
$$;

-- ── Public RPCs (anon) ────────────────────────────────────────────────────────
create or replace function public.online_print_prices()
returns table (size_cm text, price numeric, min_px_long_side integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.size_cm, p.sale_price, s.min_px_long_side
  from public.online_print_sizes s
  join public.products p on p.id = s.product_id
  where s.active and p.status = 'active'
  order by s.sort;
$$;

-- Errors are short codes the website maps to Arabic messages.
create or replace function public.submit_order(
  p_upload_id       uuid,
  p_name            text,
  p_phone           text,
  p_delivery_method text,
  p_area            text,
  p_address         text,
  p_notes           text,
  p_items           jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text := btrim(coalesce(p_name, ''));
  v_phone    text := public.normalize_eg_mobile(p_phone);
  v_address  text := nullif(btrim(coalesce(p_address, '')), '');
  v_order_id uuid;
  v_code     text;
  v_total    numeric(12, 2) := 0;
  v_count    integer;
  v_prefix   text;
  i          record;
  v_size     record;
begin
  if p_upload_id is null then
    raise exception 'invalid_upload';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'invalid_name';
  end if;
  if v_phone is null then
    raise exception 'invalid_phone';
  end if;
  if p_delivery_method not in ('pickup', 'delivery') then
    raise exception 'invalid_delivery';
  end if;
  if p_delivery_method = 'delivery' and (v_address is null or length(v_address) < 5) then
    raise exception 'address_required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_items';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 100 then
    raise exception 'invalid_items';
  end if;
  if exists (select 1 from public.orders where upload_id = p_upload_id) then
    raise exception 'duplicate_upload';
  end if;

  v_prefix := 'pending/' || p_upload_id::text || '/';

  -- Validate every line before writing anything.
  for i in
    select x.path, x.size_cm, x.quantity
    from jsonb_to_recordset(p_items) as x(path text, file_name text, size_cm text, quantity integer)
  loop
    if i.quantity is null or i.quantity < 1 or i.quantity > 50 then
      raise exception 'invalid_quantity';
    end if;
    if i.path is null or left(i.path, length(v_prefix)) <> v_prefix or position('..' in i.path) > 0 then
      raise exception 'invalid_path';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'order-uploads' and o.name = i.path) then
      raise exception 'missing_file';
    end if;
    if not exists (
      select 1 from public.online_print_sizes s join public.products p on p.id = s.product_id
      where s.size_cm = i.size_cm and s.active and p.status = 'active'
    ) then
      raise exception 'unknown_size';
    end if;
  end loop;

  if (select count(distinct x.path) from jsonb_to_recordset(p_items) as x(path text)) <> v_count then
    raise exception 'duplicate_file';
  end if;

  v_code := public.generate_order_code();

  insert into public.orders (
    code, upload_id, customer_name, customer_phone, delivery_method, area, address, notes, payment_method, total
  ) values (
    v_code, p_upload_id, v_name, v_phone, p_delivery_method,
    nullif(btrim(coalesce(p_area, '')), ''), v_address, nullif(left(btrim(coalesce(p_notes, '')), 500), ''),
    case when p_delivery_method = 'delivery' then 'cash_on_delivery' else 'pay_at_pickup' end,
    0
  )
  returning id into v_order_id;

  for i in
    select x.path, x.file_name, x.size_cm, x.quantity
    from jsonb_to_recordset(p_items) as x(path text, file_name text, size_cm text, quantity integer)
  loop
    select s.product_id, p.sale_price into v_size
    from public.online_print_sizes s join public.products p on p.id = s.product_id
    where s.size_cm = i.size_cm;

    insert into public.order_items (order_id, size_cm, product_id, quantity, unit_price, line_total, file_path, file_name)
    values (
      v_order_id, i.size_cm, v_size.product_id, i.quantity, v_size.sale_price,
      round(v_size.sale_price * i.quantity, 2), i.path, left(i.file_name, 200)
    );
    v_total := v_total + round(v_size.sale_price * i.quantity, 2);
  end loop;

  update public.orders set total = v_total where id = v_order_id;

  insert into public.order_events (order_id, action, details)
  values (v_order_id, 'created', jsonb_build_object('items', v_count, 'total', v_total));

  return jsonb_build_object('code', v_code, 'total', v_total);
end;
$$;

-- Tracking page data. Deliberately no name, phone or address.
create or replace function public.order_status_public(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'code', o.code,
    'status', o.status,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'delivery_method', o.delivery_method,
    'total', o.total,
    'photos', (select count(*) from public.order_items i where i.order_id = o.id),
    'prints', (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = o.id)
  )
  from public.orders o
  where o.code = upper(btrim(p_code));
$$;

-- ── Staff RPCs ────────────────────────────────────────────────────────────────
-- Forward moves only (new → in_progress → ready → delivered, skipping allowed); cancel until delivered.
create or replace function public.update_order_status(
  p_order_id   uuid,
  p_status     public.order_status_enum,
  p_updated_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.order_status_enum;
  v_rank    constant public.order_status_enum[] := array['new', 'in_progress', 'ready', 'delivered']::public.order_status_enum[];
begin
  if not exists (select 1 from public.profiles where id = p_updated_by and is_active) then
    raise exception 'Invalid or inactive profile.';
  end if;

  select status into v_current from public.orders where id = p_order_id for update;
  if v_current is null then
    raise exception 'Order not found.';
  end if;
  if v_current = p_status then
    return p_order_id;
  end if;
  if v_current in ('delivered', 'cancelled') then
    raise exception 'Order is already %.', v_current;
  end if;
  if p_status <> 'cancelled' and array_position(v_rank, p_status) < array_position(v_rank, v_current) then
    raise exception 'Cannot move an order back from % to %.', v_current, p_status;
  end if;

  update public.orders
  set status = p_status, status_changed_by = p_updated_by, updated_at = now()
  where id = p_order_id;

  insert into public.order_events (order_id, action, actor_id, details)
  values (p_order_id, 'status', p_updated_by, jsonb_build_object('from', v_current, 'to', p_status));

  return p_order_id;
end;
$$;

-- Turns an online order into a normal invoice (reference number = order code).
-- p_paid_amount null = paid in full, same meaning as create_invoice.
create or replace function public.confirm_order_to_invoice(
  p_order_id     uuid,
  p_confirmed_by uuid,
  p_paid_amount  numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order      public.orders%rowtype;
  v_items      jsonb;
  v_invoice_id uuid;
  v_inv_total  numeric(12, 2);
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Order not found.';
  end if;
  if v_order.invoice_id is not null then
    raise exception 'Order already has an invoice.';
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'Cancelled orders cannot be invoiced.';
  end if;

  select jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', qty))
  into v_items
  from (
    select product_id, sum(quantity)::integer as qty
    from public.order_items
    where order_id = p_order_id
    group by product_id
  ) grouped;

  v_invoice_id := public.create_invoice(
    p_confirmed_by,
    v_order.customer_name,
    v_order.customer_phone,
    0,
    p_paid_amount,
    v_items,
    v_order.code,
    null,
    null,
    null
  );

  update public.orders set invoice_id = v_invoice_id, updated_at = now() where id = p_order_id;

  select total into v_inv_total from public.invoices where id = v_invoice_id;

  insert into public.order_events (order_id, action, actor_id, details)
  values (
    p_order_id, 'invoiced', p_confirmed_by,
    jsonb_build_object('invoice_id', v_invoice_id, 'invoice_total', v_inv_total, 'order_total', v_order.total)
  );

  return v_invoice_id;
end;
$$;

-- ── Grants for the new functions ──────────────────────────────────────────────
revoke execute on function public.generate_order_code() from public, anon, authenticated;
grant execute on function public.generate_order_code() to service_role;
revoke execute on function public.normalize_eg_mobile(text) from public, anon;
grant execute on function public.normalize_eg_mobile(text) to authenticated, service_role;

grant execute on function public.online_print_prices() to anon, authenticated, service_role;
grant execute on function public.submit_order(uuid, text, text, text, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.order_status_public(text) to anon, authenticated, service_role;

-- Staff RPCs take the acting profile id as an argument, so a logged-in caller could pass someone
-- else's id. Only the myst API routes (service role, after requireApiUser + authz) may call them.
revoke execute on function public.update_order_status(uuid, public.order_status_enum, uuid) from public, anon, authenticated;
grant execute on function public.update_order_status(uuid, public.order_status_enum, uuid) to service_role;
revoke execute on function public.confirm_order_to_invoice(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.confirm_order_to_invoice(uuid, uuid, numeric) to service_role;
