-- Fixes from the mystudio-web review of online print orders (2026-11-22).

-- ── 1. Arabic-Indic digits in phone numbers ───────────────────────────────────
-- Egyptian keyboards often type ٠١٠٠١٢٣٤٥٦٧ (or Persian ۰۱۰…); convert them before validating.
create or replace function public.normalize_eg_mobile(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digits text := regexp_replace(
    translate(coalesce(p_phone, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
    '\D', '', 'g'
  );
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

-- ── 2. submit_order: idempotent per upload id, clean errors for bad quantities ─
-- If the response to a successful submit is lost (mobile data), the customer retries with the same
-- upload id. Return the existing order's code instead of an error, so they still get their code.
-- The upload id is a random UUID only the submitting browser knows, so this reveals nothing new.
-- Quantities are read as numeric so "2.5" gives invalid_quantity instead of a cast error.
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
  v_existing record;
  i          record;
  v_size     record;
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
  if v_count < 1 or v_count > 100 then
    raise exception 'invalid_items';
  end if;

  v_prefix := 'pending/' || p_upload_id::text || '/';

  for i in
    select x.path, x.size_cm, x.quantity
    from jsonb_to_recordset(p_items) as x(path text, file_name text, size_cm text, quantity numeric)
  loop
    if i.quantity is null or i.quantity <> trunc(i.quantity) or i.quantity < 1 or i.quantity > 50 then
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
    select x.path, x.file_name, x.size_cm, x.quantity::integer as quantity
    from jsonb_to_recordset(p_items) as x(path text, file_name text, size_cm text, quantity numeric)
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

  return jsonb_build_object('code', v_code, 'total', v_total, 'existing', false);
end;
$$;

-- ── 3. Cap uploads per folder ─────────────────────────────────────────────────
-- An order has at most 100 photos, so an upload folder never needs more than 100 files.
-- The count runs as a definer function because anon cannot read storage.objects. It must stay
-- executable by anon (the insert policy runs it as the uploading role), so it only answers for a
-- UUID-shaped folder and matches by exact prefix (no LIKE wildcards): a caller can count only a
-- folder whose random id it already knows, never the whole bucket.
-- Note: this caps one folder, not one client; real per-client rate limiting needs signed upload
-- URLs from a rate-limited server route (or a firewall rule) and is still open.
create or replace function public.pending_upload_count(p_folder text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 0
    else (
      select count(*)::integer
      from storage.objects o
      where o.bucket_id = 'order-uploads'
        and left(o.name, 45) = 'pending/' || p_folder || '/'
    )
  end;
$$;

revoke execute on function public.pending_upload_count(text) from public;
grant execute on function public.pending_upload_count(text) to anon, authenticated, service_role;

drop policy if exists "order_uploads_anon_insert" on storage.objects;
create policy "order_uploads_anon_insert" on storage.objects
for insert to anon
with check (
  bucket_id = 'order-uploads'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = 'pending'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.pending_upload_count((storage.foldername(name))[2]) < 100
);

-- ── 4. Find uploads no order uses (removed photos, abandoned or junk uploads) ──
-- myst's cleanup route deletes these through the Storage API (deleting rows here would leave the files).
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
  order by o.created_at
  limit greatest(1, least(p_limit, 1000));
$$;

revoke execute on function public.orphan_upload_paths(interval, integer) from public, anon, authenticated;
grant execute on function public.orphan_upload_paths(interval, integer) to service_role;
