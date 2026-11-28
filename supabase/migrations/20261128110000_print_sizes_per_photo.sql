-- One photo, several print sizes.
-- The website cart keeps uploaded print photos and lets each photo have up to 3 sizes. Checkout sends one
-- print line per (photo, size), so the same "path" can appear on 2-3 print lines with different "size_cm".
-- submit_order (same signature, built on 20261128100000_gift_designs.sql) now checks files like this:
--   * print lines are distinct by (path, size_cm): one path in two sizes is fine, the same path and size
--     twice is duplicate_file.
--   * gift line paths and design photo paths are distinct among themselves, and none of them may equal a
--     print path (duplicate_file).
--   * distinct files in the order (print paths counted once + gift paths + design photos) stay at most 200;
--     an order may have up to 300 print lines (invalid_items above either).
-- Everything else (old print lines, old gift lines, designs, error codes) is unchanged.

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
  v_print_files   integer;  -- distinct print photos
  v_gift_files    integer;  -- gift line paths + design photos
  v_gift_distinct integer;
  v_shared        integer;  -- gift files that are also a print photo
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
  if v_prints > 300 or v_gifts > 20 then
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

  -- Print lines: one per (photo, size), so a photo may be printed in several sizes.
  if (
    select count(*) <> count(distinct (x.path, x.size_cm))
    from jsonb_to_recordset(p_items) as x(kind text, path text, size_cm text)
    where coalesce(x.kind, 'print') = 'print'
  ) then
    raise exception 'duplicate_file';
  end if;

  -- Gift files (gift line paths and design photos) are each used once and are never a print's photo.
  -- At most 200 distinct files per order (a print photo counts once, whatever its sizes).
  with p as (
    select distinct x.path
    from jsonb_to_recordset(p_items) as x(kind text, path text)
    where coalesce(x.kind, 'print') = 'print'
  ),
  g as (
    select x.path
    from jsonb_to_recordset(p_items) as x(kind text, path text)
    where x.kind = 'gift' and x.path is not null
    union all
    select ph ->> 'path'
    from jsonb_each(v_designs) d(line_no, design)
    cross join lateral jsonb_array_elements(d.design -> 'photos') ph
  )
  select (select count(*) from p),
         (select count(*) from g),
         (select count(distinct g.path) from g),
         (select count(*) from g where g.path in (select p.path from p))
  into v_print_files, v_gift_files, v_gift_distinct, v_shared;
  if v_gift_files <> v_gift_distinct or v_shared > 0 then
    raise exception 'duplicate_file';
  end if;
  if v_print_files + v_gift_files > 200 then
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
