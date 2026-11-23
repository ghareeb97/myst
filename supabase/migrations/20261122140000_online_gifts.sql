-- Online gift orders from the public website (mystudio-web), Phase 2 slice 2.
-- A customer picks a gift, uploads a photo and/or types a name, and orders it together with prints
-- in one order. The website still reaches the database only through anon RPCs:
-- online_print_prices, online_gift_prices (new), submit_order (now also takes gift lines) and
-- order_status_public. Prices always come from myst's products, never from the website.

-- ── 1. Gift products ──────────────────────────────────────────────────────────
-- Prices from mystudio-web data/catalog.json. Managers edit them in Products as usual.
-- is_digital = true: these are made to order and start at 0 stock, so tracking stock would only
-- raise low-stock alerts. To track the blanks, point online_gift_products.product_id at the real
-- stock product (or set is_digital = false and enter stock).
insert into public.products (sku, name, category, sale_price, current_stock, status, is_digital)
values
  ('GIFT-WHITE-MUG',          'White photo mug',      'Gifts', 100, 0, 'active', true),
  ('GIFT-MAGIC-MUG',          'Magic mug',            'Gifts', 150, 0, 'active', true),
  ('GIFT-SHAPED-MUG',         'Shaped mug',           'Gifts', 175, 0, 'active', true),
  ('GIFT-LED-FRAME',          'LED touch frame',      'Gifts', 360, 0, 'active', true),
  ('GIFT-MAGIC-MIRROR-FRAME', 'Magic mirror frame',   'Gifts', 200, 0, 'active', true),
  ('GIFT-PHOTO-MAGNET',       'Photo magnet 10×10',   'Gifts',  50, 0, 'active', true),
  ('GIFT-COASTER',            'Photo coaster',        'Gifts',  25, 0, 'active', true),
  ('GIFT-KEYCHAIN',           'Photo keychain',       'Gifts',  50, 0, 'active', true),
  ('GIFT-LUX-KEYCHAIN',       'Lux keychain',         'Gifts', 100, 0, 'active', true),
  ('GIFT-BUTTON-BADGE',       'Button badge',         'Gifts',  25, 0, 'active', true),
  ('GIFT-WATER-BOTTLE',       'Stainless water bottle','Gifts', 150, 0, 'active', true),
  ('GIFT-PHOTO-PUZZLE',       'Photo puzzle',         'Gifts',  75, 0, 'active', true),
  ('GIFT-A4-PUZZLE',          'A4 puzzle',            'Gifts', 100, 0, 'active', true),
  ('GIFT-NOTEBOOK-A6',        'Small notebook A6',    'Gifts',  75, 0, 'active', true)
on conflict (sku) do nothing;

-- ── 2. Gifts offered online ───────────────────────────────────────────────────
-- slug matches mystudio-web's catalog.json. personalization:
--   photo         = a photo is required, a name or short phrase is optional
--   text          = a name is required, no photo
--   photo_or_text = a photo, a name, or both (at least one)
-- Not online yet (stay on WhatsApp): thermal-bottle (two variants) and tshirt-print (needs a shirt size).
create table public.online_gift_products (
  slug            text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  product_id      uuid not null references public.products (id),
  personalization text not null check (personalization in ('photo', 'text', 'photo_or_text')),
  max_text_length integer not null default 40 check (max_text_length between 1 and 200),
  sort            integer not null default 0,
  active          boolean not null default true
);

insert into public.online_gift_products (slug, product_id, personalization, sort)
select g.slug, p.id, g.personalization, g.sort
from (values
  ('white-mug',          'GIFT-WHITE-MUG',          'photo_or_text',  1),
  ('magic-mug',          'GIFT-MAGIC-MUG',          'photo',          2),
  ('shaped-mug',         'GIFT-SHAPED-MUG',         'photo_or_text',  3),
  ('led-frame',          'GIFT-LED-FRAME',          'photo',          4),
  ('magic-mirror-frame', 'GIFT-MAGIC-MIRROR-FRAME', 'photo',          5),
  ('photo-magnet',       'GIFT-PHOTO-MAGNET',       'photo',          6),
  ('coaster',            'GIFT-COASTER',            'photo',          7),
  ('keychain',           'GIFT-KEYCHAIN',           'photo',          8),
  ('lux-keychain',       'GIFT-LUX-KEYCHAIN',       'photo_or_text',  9),
  ('button-badge',       'GIFT-BUTTON-BADGE',       'photo_or_text', 10),
  ('water-bottle',       'GIFT-WATER-BOTTLE',       'photo_or_text', 11),
  ('photo-puzzle',       'GIFT-PHOTO-PUZZLE',       'photo',         12),
  ('a4-puzzle',          'GIFT-A4-PUZZLE',          'photo',         13),
  ('notebook-a6',        'GIFT-NOTEBOOK-A6',        'photo_or_text', 14)
) as g(slug, sku, personalization, sort)
join public.products p on p.sku = g.sku
on conflict (slug) do nothing;

-- Active staff read; nobody writes through the API (changes go through migrations for now).
alter table public.online_gift_products enable row level security;
create policy "online_gift_products_read_staff" on public.online_gift_products
  for select to authenticated using (public.current_user_role() is not null);
revoke all on public.online_gift_products from public, anon, authenticated;
grant select on public.online_gift_products to authenticated;
grant all privileges on public.online_gift_products to service_role;

-- ── 3. Order lines can be gifts ───────────────────────────────────────────────
-- Gift lines have no print size; a name-only gift has no file. line_no keeps the customer's order.
alter table public.order_items drop constraint order_items_kind_check;
alter table public.order_items
  add constraint order_items_kind_check check (kind in ('print', 'gift')),
  alter column size_cm drop not null,
  alter column file_path drop not null,
  add column gift_slug     text null,
  add column personal_text text null,
  add column line_no       integer null;

alter table public.order_items add constraint order_items_kind_shape check (
  (kind = 'print' and size_cm is not null and file_path is not null and gift_slug is null and personal_text is null)
  or
  (kind = 'gift' and gift_slug is not null and size_cm is null and (file_path is not null or personal_text is not null))
);

-- ── 4. Live gift prices for the website ───────────────────────────────────────
create or replace function public.online_gift_prices()
returns table (slug text, price numeric, personalization text, max_text_length integer)
language sql
stable
security definer
set search_path = public
as $$
  select g.slug, p.sale_price, g.personalization, g.max_text_length
  from public.online_gift_products g
  join public.products p on p.id = g.product_id
  where g.active and p.status = 'active'
  order by g.sort, g.slug;
$$;

revoke execute on function public.online_gift_prices() from public;
grant execute on function public.online_gift_prices() to anon, authenticated, service_role;

-- ── 5. submit_order: print and gift lines in one order ────────────────────────
-- Same signature, idempotency and error codes as before. Lines without "kind" are prints, so the
-- current website keeps working. A gift line is
--   {"kind": "gift", "slug": "magic-mug", "quantity": 1, "path": "pending/<upload_id>/g-…", "file_name": "…", "text": "Mama"}
-- with path and text optional as the gift's personalization allows.
-- New error codes: unknown_gift, photo_required, text_required, personalization_required, invalid_text.
-- Limits: at most 100 print lines, 20 gift lines and 100 files per order.
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
  v_prints   integer;
  v_gifts    integer;
  v_prefix   text;
  v_text     text;
  v_existing record;
  v_gift     record;
  v_size     record;
  i          record;
begin
  if p_upload_id is null then
    raise exception 'invalid_upload';
  end if;

  select code, total into v_existing from public.orders where upload_id = p_upload_id;
  if found then
    return jsonb_build_object('code', v_existing.code, 'total', v_existing.total, 'existing', true);
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
  if v_count < 1 then
    raise exception 'invalid_items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'kind', 'print') not in ('print', 'gift')
  ) then
    raise exception 'invalid_items';
  end if;
  select count(*) filter (where coalesce(e ->> 'kind', 'print') = 'print'),
         count(*) filter (where e ->> 'kind' = 'gift')
  into v_prints, v_gifts
  from jsonb_array_elements(p_items) e;
  if v_prints > 100 or v_gifts > 20 then
    raise exception 'invalid_items';
  end if;

  v_prefix := 'pending/' || p_upload_id::text || '/';

  -- Validate every line before writing anything.
  for i in
    select coalesce(x.kind, 'print') as kind, x.path, x.size_cm, x.quantity, x.slug, x.text
    from jsonb_to_recordset(p_items)
      as x(kind text, path text, file_name text, size_cm text, quantity numeric, slug text, text text)
  loop
    if i.quantity is null or i.quantity <> trunc(i.quantity) or i.quantity < 1 or i.quantity > 50 then
      raise exception 'invalid_quantity';
    end if;

    if i.kind = 'print' then
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
    else
      select g.personalization, g.max_text_length into v_gift
      from public.online_gift_products g join public.products p on p.id = g.product_id
      where g.slug = i.slug and g.active and p.status = 'active';
      if not found then
        raise exception 'unknown_gift';
      end if;

      -- Spaces and line breaks collapse to one space; other control characters are refused.
      v_text := nullif(regexp_replace(btrim(coalesce(i.text, '')), '\s+', ' ', 'g'), '');
      if v_text is not null and (length(v_text) > v_gift.max_text_length or v_text ~ '[[:cntrl:]]') then
        raise exception 'invalid_text';
      end if;

      if i.path is not null then
        if v_gift.personalization = 'text' then
          raise exception 'invalid_items';
        end if;
        if left(i.path, length(v_prefix)) <> v_prefix or position('..' in i.path) > 0 then
          raise exception 'invalid_path';
        end if;
        if not exists (select 1 from storage.objects o where o.bucket_id = 'order-uploads' and o.name = i.path) then
          raise exception 'missing_file';
        end if;
      end if;

      if v_gift.personalization = 'photo' and i.path is null then
        raise exception 'photo_required';
      end if;
      if v_gift.personalization = 'text' and v_text is null then
        raise exception 'text_required';
      end if;
      if v_gift.personalization = 'photo_or_text' and i.path is null and v_text is null then
        raise exception 'personalization_required';
      end if;
    end if;
  end loop;

  if (select count(distinct x.path) from jsonb_to_recordset(p_items) as x(path text))
     <> (select count(x.path) from jsonb_to_recordset(p_items) as x(path text)) then
    raise exception 'duplicate_file';
  end if;
  if (select count(x.path) from jsonb_to_recordset(p_items) as x(path text)) > 100 then
    raise exception 'invalid_items';
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
    select coalesce(x.kind, 'print') as kind, x.path, x.file_name, x.size_cm, x.quantity::integer as quantity,
           x.slug, x.text, n.line_no
    from jsonb_array_elements(p_items) with ordinality as n(item, line_no)
    cross join lateral jsonb_to_record(n.item)
      as x(kind text, path text, file_name text, size_cm text, quantity numeric, slug text, text text)
    order by n.line_no
  loop
    if i.kind = 'print' then
      select s.product_id, p.sale_price into v_size
      from public.online_print_sizes s join public.products p on p.id = s.product_id
      where s.size_cm = i.size_cm;

      insert into public.order_items (
        order_id, kind, size_cm, product_id, quantity, unit_price, line_total, file_path, file_name, line_no
      ) values (
        v_order_id, 'print', i.size_cm, v_size.product_id, i.quantity, v_size.sale_price,
        round(v_size.sale_price * i.quantity, 2), i.path, left(i.file_name, 200), i.line_no
      );
      v_total := v_total + round(v_size.sale_price * i.quantity, 2);
    else
      select g.product_id, p.sale_price into v_size
      from public.online_gift_products g join public.products p on p.id = g.product_id
      where g.slug = i.slug;

      insert into public.order_items (
        order_id, kind, gift_slug, product_id, quantity, unit_price, line_total,
        file_path, file_name, personal_text, line_no
      ) values (
        v_order_id, 'gift', i.slug, v_size.product_id, i.quantity, v_size.sale_price,
        round(v_size.sale_price * i.quantity, 2),
        i.path, case when i.path is null then null else left(i.file_name, 200) end,
        nullif(regexp_replace(btrim(coalesce(i.text, '')), '\s+', ' ', 'g'), ''),
        i.line_no
      );
      v_total := v_total + round(v_size.sale_price * i.quantity, 2);
    end if;
  end loop;

  update public.orders set total = v_total where id = v_order_id;

  insert into public.order_events (order_id, action, details)
  values (
    v_order_id, 'created',
    jsonb_build_object('items', v_count, 'prints', v_prints, 'gifts', v_gifts, 'total', v_total)
  );

  return jsonb_build_object('code', v_code, 'total', v_total, 'existing', false);
end;
$$;

-- ── 6. Tracking page: count gifts separately ──────────────────────────────────
-- photos/prints now count print lines only; gifts = number of gift pieces. Still no name, phone or address.
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
    'photos', (select count(*) from public.order_items i where i.order_id = o.id and i.kind = 'print'),
    'prints', (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = o.id and i.kind = 'print'),
    'gifts',  (select coalesce(sum(i.quantity), 0) from public.order_items i where i.order_id = o.id and i.kind = 'gift')
  )
  from public.orders o
  where o.code = upper(btrim(p_code));
$$;
