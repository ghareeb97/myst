-- Gift designer, Phase A (database and staff side).
-- On the website a customer picks a ready layout (single, duo, trio, quad, photo-name, name), places up
-- to 4 photos with drag/zoom crop, adds text with a font and color, and sees a live mockup. The browser
-- renders the final print-ready JPG and uploads it plus each original photo to
-- order-uploads/pending/<upload_id>/. The order then carries, per gift line:
--   path      = the rendered print file (order_items.file_path, as before)
--   text      = the words on the gift (order_items.personal_text, as before)
--   design    = how it was made (new order_items.design):
--     {"v": 1, "template": "<slug>", "rev": 1..999, "layout": "<id>",
--      "photos": [{"slot": 0..3, "path": "pending/<upload_id>/…", "file_name": "…", "w": px, "h": px,
--                  "crop": {"x": -1..1, "y": -1..1, "s": 1..5}}],
--      "text": {"font": "cairo" | "amiri" | "ruqaa", "color": "#rrggbb"} | null}
-- Old gift lines without a design and print lines keep working unchanged.

-- ── 1. order_items.design ─────────────────────────────────────────────────────
-- Only gift lines that have the rendered print file can carry a design.
alter table public.order_items
  add column design jsonb null;

alter table public.order_items add constraint order_items_design_shape check (
  design is null
  or (kind = 'gift' and file_path is not null and jsonb_typeof(design) = 'object')
);

-- orphan_upload_paths looks up design photo paths with @>.
create index order_items_design_idx on public.order_items using gin (design jsonb_path_ops)
  where design is not null;

-- ── 2. How many photos each gift's designs may hold ───────────────────────────
alter table public.online_gift_products
  add column max_photos smallint not null default 1 check (max_photos between 1 and 4);

update public.online_gift_products
set max_photos = 4
where slug in (
  'white-mug', 'magic-mug', 'shaped-mug',
  'led-frame', 'magic-mirror-frame',
  'photo-puzzle', 'a4-puzzle',
  'water-bottle', 'notebook-a6'
);
-- photo-magnet, coaster, keychain, lux-keychain and button-badge stay at 1.

-- ── 3. online_gift_prices returns max_photos ──────────────────────────────────
-- The return type changes, so drop and recreate (create or replace cannot change it).
drop function public.online_gift_prices();

create function public.online_gift_prices()
returns table (slug text, price numeric, personalization text, max_text_length integer, max_photos integer)
language sql
stable
security definer
set search_path = public
as $$
  select g.slug, p.sale_price, g.personalization, g.max_text_length, g.max_photos::integer
  from public.online_gift_products g
  join public.products p on p.id = g.product_id
  where g.active and p.status = 'active'
  order by g.sort, g.slug;
$$;

revoke execute on function public.online_gift_prices() from public;
grant execute on function public.online_gift_prices() to anon, authenticated, service_role;

-- ── 4. clean_gift_design: validate a design and rebuild it from known keys ────
-- Internal helper for submit_order. p_prefix is the order's folder ('pending/<upload_id>/'),
-- p_max the most photos this gift allows. Errors:
--   invalid_design   shape, size (> 4 KB), version, layout, template, rev, slots, crop, font or color
--   too_many_photos  more photos than p_max
--   invalid_path     a photo outside the order's folder, or with '..'
--   missing_file     a photo that was never uploaded
-- Returns only known keys, photos sorted by slot, numbers normalized.
create function public.clean_gift_design(p_design jsonb, p_prefix text, p_max integer)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_photos  jsonb;
  v_out     jsonb := '[]'::jsonb;
  v_text    jsonb;
  v_slots   integer[] := '{}';
  v_photo   jsonb;
  v_crop    jsonb;
  v_slot    integer;
  v_path    text;
  v_name    text;
  v_color   text;
begin
  if p_design is null or jsonb_typeof(p_design) is distinct from 'object' or octet_length(p_design::text) > 4096 then
    raise exception 'invalid_design';
  end if;

  if jsonb_typeof(p_design -> 'v') is distinct from 'number' or (p_design ->> 'v')::numeric <> 1 then
    raise exception 'invalid_design';
  end if;
  if jsonb_typeof(p_design -> 'layout') is distinct from 'string' or (p_design ->> 'layout') !~ '^[a-z0-9-]{1,20}$' then
    raise exception 'invalid_design';
  end if;
  if jsonb_typeof(p_design -> 'template') is distinct from 'string'
     or length(p_design ->> 'template') > 40
     or (p_design ->> 'template') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_design';
  end if;
  if jsonb_typeof(p_design -> 'rev') is distinct from 'number'
     or (p_design ->> 'rev')::numeric <> trunc((p_design ->> 'rev')::numeric)
     or (p_design ->> 'rev')::numeric not between 1 and 999 then
    raise exception 'invalid_design';
  end if;

  -- photos: an array (missing or null = none).
  v_photos := coalesce(nullif(p_design -> 'photos', 'null'::jsonb), '[]'::jsonb);
  if jsonb_typeof(v_photos) <> 'array' then
    raise exception 'invalid_design';
  end if;
  if jsonb_array_length(v_photos) > greatest(coalesce(p_max, 0), 0) then
    raise exception 'too_many_photos';
  end if;

  for v_photo in select e from jsonb_array_elements(v_photos) e loop
    if jsonb_typeof(v_photo) is distinct from 'object' then
      raise exception 'invalid_design';
    end if;

    if jsonb_typeof(v_photo -> 'slot') is distinct from 'number'
       or (v_photo ->> 'slot')::numeric not in (0, 1, 2, 3) then
      raise exception 'invalid_design';
    end if;
    v_slot := (v_photo ->> 'slot')::numeric::integer;
    if v_slot = any (v_slots) then
      raise exception 'invalid_design';
    end if;
    v_slots := v_slots || v_slot;

    if jsonb_typeof(v_photo -> 'w') is distinct from 'number'
       or jsonb_typeof(v_photo -> 'h') is distinct from 'number'
       or (v_photo ->> 'w')::numeric <> trunc((v_photo ->> 'w')::numeric)
       or (v_photo ->> 'h')::numeric <> trunc((v_photo ->> 'h')::numeric)
       or (v_photo ->> 'w')::numeric not between 1 and 30000
       or (v_photo ->> 'h')::numeric not between 1 and 30000 then
      raise exception 'invalid_design';
    end if;

    v_crop := v_photo -> 'crop';
    if jsonb_typeof(v_crop) is distinct from 'object'
       or jsonb_typeof(v_crop -> 'x') is distinct from 'number'
       or jsonb_typeof(v_crop -> 'y') is distinct from 'number'
       or jsonb_typeof(v_crop -> 's') is distinct from 'number'
       or (v_crop ->> 'x')::numeric not between -1 and 1
       or (v_crop ->> 'y')::numeric not between -1 and 1
       or (v_crop ->> 's')::numeric not between 1 and 5 then
      raise exception 'invalid_design';
    end if;

    if (v_photo -> 'file_name') is not null and v_photo -> 'file_name' <> 'null'::jsonb
       and jsonb_typeof(v_photo -> 'file_name') <> 'string' then
      raise exception 'invalid_design';
    end if;
    v_name := nullif(left(btrim(coalesce(v_photo ->> 'file_name', '')), 200), '');

    if jsonb_typeof(v_photo -> 'path') is distinct from 'string' then
      raise exception 'invalid_path';
    end if;
    v_path := v_photo ->> 'path';
    if p_prefix is null or left(v_path, length(p_prefix)) <> p_prefix or position('..' in v_path) > 0 then
      raise exception 'invalid_path';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'order-uploads' and o.name = v_path) then
      raise exception 'missing_file';
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'slot', v_slot,
      'path', v_path,
      'file_name', v_name,
      'w', (v_photo ->> 'w')::numeric::integer,
      'h', (v_photo ->> 'h')::numeric::integer,
      'crop', jsonb_build_object(
        'x', round((v_crop ->> 'x')::numeric, 4),
        'y', round((v_crop ->> 'y')::numeric, 4),
        's', round((v_crop ->> 's')::numeric, 4)
      )
    ));
  end loop;

  -- text: null or {font, color}. Colors are stored lower-case.
  if (p_design -> 'text') is null or p_design -> 'text' = 'null'::jsonb then
    v_text := null;
  else
    if jsonb_typeof(p_design -> 'text') <> 'object'
       or jsonb_typeof(p_design -> 'text' -> 'font') is distinct from 'string'
       or jsonb_typeof(p_design -> 'text' -> 'color') is distinct from 'string'
       or (p_design -> 'text' ->> 'font') not in ('cairo', 'amiri', 'ruqaa') then
      raise exception 'invalid_design';
    end if;
    v_color := lower(p_design -> 'text' ->> 'color');
    if v_color !~ '^#[0-9a-f]{6}$' then
      raise exception 'invalid_design';
    end if;
    v_text := jsonb_build_object('font', p_design -> 'text' ->> 'font', 'color', v_color);
  end if;

  return jsonb_build_object(
    'v', 1,
    'template', p_design ->> 'template',
    'rev', (p_design ->> 'rev')::numeric::integer,
    'layout', p_design ->> 'layout',
    'photos', coalesce((select jsonb_agg(e order by (e ->> 'slot')::integer) from jsonb_array_elements(v_out) e), '[]'::jsonb),
    'text', v_text
  );
end;
$$;

revoke execute on function public.clean_gift_design(jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.clean_gift_design(jsonb, text, integer) to service_role;

-- ── 5. submit_order: gift lines can carry a design ────────────────────────────
-- Same signature, idempotency and error codes as 20261122140000_online_gifts.sql, plus:
--   * a gift line may carry "design" (see the top of this file). It needs "path" (the rendered print
--     file), which is now also allowed for 'text' gifts when they have a design. The stored design is
--     clean_gift_design's rebuilt object.
--   * "has a photo" = the design has at least one photo, or (lines without a design) a path is given,
--     so photo_required / personalization_required follow what the customer actually placed.
--   * every file (line paths and design photos) must be distinct across the order (duplicate_file),
--     and an order holds at most 200 files (invalid_items).
--   * a design on a print line is invalid_items; a design without a path is invalid_design.
-- Gift line: {"kind": "gift", "slug", "quantity", "path"?, "file_name"?, "text"?, "design"?}.
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
  v_name      text := btrim(coalesce(p_name, ''));
  v_phone     text := public.normalize_eg_mobile(p_phone);
  v_address   text := nullif(btrim(coalesce(p_address, '')), '');
  v_order_id  uuid;
  v_code      text;
  v_total     numeric(12, 2) := 0;
  v_count     integer;
  v_prints    integer;
  v_gifts     integer;
  v_prefix    text;
  v_text      text;
  v_has_photo boolean;
  v_clean     jsonb;
  v_designs   jsonb := '{}'::jsonb;  -- line_no -> cleaned design
  v_files     integer;
  v_distinct  integer;
  v_existing  record;
  v_gift      record;
  v_size      record;
  i           record;
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
    select coalesce(x.kind, 'print') as kind, x.path, x.size_cm, x.quantity, x.slug, x.text,
           nullif(x.design, 'null'::jsonb) as design, n.line_no
    from jsonb_array_elements(p_items) with ordinality as n(item, line_no)
    cross join lateral jsonb_to_record(n.item)
      as x(kind text, path text, file_name text, size_cm text, quantity numeric, slug text, text text, design jsonb)
    order by n.line_no
  loop
    if i.quantity is null or i.quantity <> trunc(i.quantity) or i.quantity < 1 or i.quantity > 50 then
      raise exception 'invalid_quantity';
    end if;

    if i.kind = 'print' then
      if i.design is not null then
        raise exception 'invalid_items';
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
    else
      select g.personalization, g.max_text_length, g.max_photos into v_gift
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

      if i.design is not null then
        -- A designed gift: path is the rendered print file, the photos are in the design.
        if i.path is null then
          raise exception 'invalid_design';
        end if;
        if left(i.path, length(v_prefix)) <> v_prefix or position('..' in i.path) > 0 then
          raise exception 'invalid_path';
        end if;
        if not exists (select 1 from storage.objects o where o.bucket_id = 'order-uploads' and o.name = i.path) then
          raise exception 'missing_file';
        end if;
        v_clean := public.clean_gift_design(
          i.design, v_prefix,
          case when v_gift.personalization = 'text' then 0 else v_gift.max_photos end
        );
        v_designs := v_designs || jsonb_build_object(i.line_no::text, v_clean);
        v_has_photo := jsonb_array_length(v_clean -> 'photos') > 0;
      else
        -- An old-style gift line: path (if any) is the customer's photo.
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
        v_has_photo := i.path is not null;
      end if;

      if v_gift.personalization = 'photo' and not v_has_photo then
        raise exception 'photo_required';
      end if;
      if v_gift.personalization = 'text' and v_text is null then
        raise exception 'text_required';
      end if;
      if v_gift.personalization = 'photo_or_text' and not v_has_photo and v_text is null then
        raise exception 'personalization_required';
      end if;
    end if;
  end loop;

  -- Every file in the order (line paths and design photos) is used once; at most 200 files.
  with f as (
    select x.path from jsonb_to_recordset(p_items) as x(path text) where x.path is not null
    union all
    select ph ->> 'path'
    from jsonb_each(v_designs) d(line_no, design)
    cross join lateral jsonb_array_elements(d.design -> 'photos') ph
  )
  select count(*), count(distinct f.path) into v_files, v_distinct from f;
  if v_files <> v_distinct then
    raise exception 'duplicate_file';
  end if;
  if v_files > 200 then
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
        file_path, file_name, personal_text, design, line_no
      ) values (
        v_order_id, 'gift', i.slug, v_size.product_id, i.quantity, v_size.sale_price,
        round(v_size.sale_price * i.quantity, 2),
        i.path, case when i.path is null then null else left(i.file_name, 200) end,
        nullif(regexp_replace(btrim(coalesce(i.text, '')), '\s+', ' ', 'g'), ''),
        v_designs -> i.line_no::text,
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

-- create or replace keeps the existing grants (anon, authenticated, service_role); restate them anyway.
revoke execute on function public.submit_order(uuid, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.submit_order(uuid, text, text, text, text, text, text, jsonb) to anon, authenticated, service_role;

-- ── 6. Orphan uploads: keep design photos ─────────────────────────────────────
-- A file is in use when it is a line's file_path or one of its design photos.
create or replace function public.orphan_upload_paths(
  p_older_than interval default interval '24 hours',
  p_limit      integer  default 500
)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'order-uploads'
    and o.name like 'pending/%'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.order_items i where i.file_path = o.name)
    and not exists (
      select 1 from public.order_items i
      where i.design is not null
        and i.design @> jsonb_build_object('photos', jsonb_build_array(jsonb_build_object('path', o.name)))
    )
  order by o.created_at
  limit greatest(1, least(p_limit, 1000));
$$;

revoke execute on function public.orphan_upload_paths(interval, integer) from public, anon, authenticated;
grant execute on function public.orphan_upload_paths(interval, integer) to service_role;

-- ── 7. Upload folder cap: 100 → 300 files ─────────────────────────────────────
-- A designed gift uploads its print file plus up to 4 originals, and customers re-crop and replace
-- photos before ordering, so a folder can need more than the order's 200 files.
drop policy if exists "order_uploads_anon_insert" on storage.objects;
create policy "order_uploads_anon_insert" on storage.objects
for insert to anon
with check (
  bucket_id = 'order-uploads'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = 'pending'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.pending_upload_count((storage.foldername(name))[2]) < 300
);
