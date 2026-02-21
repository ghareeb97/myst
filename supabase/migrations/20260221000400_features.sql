-- ── Invoice date ────────────────────────────────────────────────────────────
alter table public.invoices
  add column invoice_date date null;

-- Backfill existing rows with date from created_at in Cairo timezone
update public.invoices
set invoice_date = (created_at at time zone 'Africa/Cairo')::date;

-- ── Product flags ────────────────────────────────────────────────────────────
alter table public.products
  add column is_digital boolean not null default false,
  add column allow_price_override boolean not null default false;

-- ── Recreate create_invoice with new params ──────────────────────────────────
drop function if exists public.create_invoice(uuid, text, text, numeric, numeric, jsonb, text);

create or replace function public.create_invoice(
  p_created_by uuid,
  p_customer_name text,
  p_customer_phone text,
  p_discount numeric,
  p_paid_amount numeric,
  p_items jsonb,
  p_reference_number text default null,
  p_invoice_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := coalesce(p_discount, 0);
  v_total numeric(12,2);
  v_paid_amount numeric(12,2);
  v_remaining numeric(12,2);
  v_status public.payment_status_enum;
  v_role public.role_enum;
  v_invoice_date date;
  i record;
  v_product record;
  v_unit_price numeric(12,2);
  product_ids uuid[] := '{}';
  quantities integer[] := '{}';
  unit_prices numeric[] := '{}';
  is_digitals boolean[] := '{}';
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Invoice requires at least one line item.';
  end if;
  if v_discount < 0 then
    raise exception 'Discount cannot be negative.';
  end if;

  select role into v_role from public.profiles where id = p_created_by and is_active = true;
  if v_role is null then
    raise exception 'Invalid or inactive creator profile.';
  end if;
  if v_role not in ('manager', 'sales') then
    raise exception 'Creator role is not allowed to create invoices.';
  end if;

  -- Resolve invoice date (default to today in Cairo timezone)
  v_invoice_date := coalesce(
    p_invoice_date,
    (now() at time zone 'Africa/Cairo')::date
  );

  for i in
    select *
    from jsonb_to_recordset(p_items) as x(
      product_id uuid,
      quantity integer,
      custom_price numeric
    )
  loop
    if i.product_id is null or i.quantity is null or i.quantity <= 0 then
      raise exception 'Each invoice line requires product_id and positive quantity.';
    end if;

    select id, sale_price, status, is_digital, allow_price_override
    into v_product
    from public.products
    where id = i.product_id
    for update;

    if not found then
      raise exception 'Product % not found.', i.product_id;
    end if;
    if v_product.status <> 'active' then
      raise exception 'Product % is inactive.', i.product_id;
    end if;

    -- Use custom_price if product allows override and custom_price provided
    if v_product.allow_price_override and i.custom_price is not null then
      v_unit_price := round(greatest(0, i.custom_price), 2);
    else
      v_unit_price := v_product.sale_price;
    end if;
    product_ids := array_append(product_ids, i.product_id);
    quantities := array_append(quantities, i.quantity);
    unit_prices := array_append(unit_prices, v_unit_price);
    is_digitals := array_append(is_digitals, v_product.is_digital);
    v_subtotal := v_subtotal + (v_unit_price * i.quantity);
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_total := round(greatest(0, v_subtotal - v_discount), 2);

  if p_paid_amount is null then
    v_paid_amount := v_total;
  else
    v_paid_amount := round(greatest(0, p_paid_amount), 2);
  end if;

  if v_paid_amount > v_total then
    raise exception 'Paid amount cannot exceed invoice total.';
  end if;

  v_remaining := round(v_total - v_paid_amount, 2);
  if v_paid_amount = 0 then
    v_status := 'unpaid';
  elsif v_paid_amount = v_total then
    v_status := 'paid';
  else
    v_status := 'partially_paid';
  end if;

  v_invoice_number := public.next_invoice_number();

  insert into public.invoices (
    invoice_number,
    invoice_date,
    created_by,
    customer_name,
    customer_phone,
    reference_number,
    subtotal,
    discount,
    total,
    paid_amount,
    remaining_amount,
    payment_status,
    status
  )
  values (
    v_invoice_number,
    v_invoice_date,
    p_created_by,
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_phone), ''),
    nullif(trim(coalesce(p_reference_number, '')), ''),
    v_subtotal,
    v_discount,
    v_total,
    v_paid_amount,
    v_remaining,
    v_status,
    'confirmed'
  )
  returning id into v_invoice_id;

  for i in 1 .. array_length(product_ids, 1) loop
    insert into public.invoice_items (
      invoice_id,
      product_id,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_invoice_id,
      product_ids[i],
      quantities[i],
      unit_prices[i],
      round(unit_prices[i] * quantities[i], 2)
    );

    -- Skip stock deduction for digital products
    if not is_digitals[i] then
      update public.products
      set current_stock = current_stock - quantities[i]
      where id = product_ids[i];

      insert into public.stock_movements (
        product_id,
        invoice_id,
        movement_type,
        quantity_delta,
        created_by,
        note
      )
      values (
        product_ids[i],
        v_invoice_id,
        'sale',
        -quantities[i],
        p_created_by,
        'Invoice confirmation'
      );
    end if;
  end loop;

  return v_invoice_id;
end;
$$;

grant execute on function public.create_invoice(uuid, text, text, numeric, numeric, jsonb, text, date) to authenticated, service_role;

-- ── update_invoice_info: edit customer/date/reference ───────────────────────
create or replace function public.update_invoice_info(
  p_invoice_id uuid,
  p_updated_by uuid,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_reference_number text default null,
  p_invoice_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_role public.role_enum;
begin
  select role into v_role from public.profiles where id = p_updated_by and is_active = true;
  if v_role <> 'manager' then
    raise exception 'Only manager can edit invoice info.';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.';
  end if;
  if v_invoice.status = 'void' then
    raise exception 'Cannot edit a voided invoice.';
  end if;

  update public.invoices
  set
    customer_name    = nullif(trim(coalesce(p_customer_name, '')), ''),
    customer_phone   = nullif(trim(coalesce(p_customer_phone, '')), ''),
    reference_number = nullif(trim(coalesce(p_reference_number, '')), ''),
    invoice_date     = coalesce(p_invoice_date, v_invoice.invoice_date, (v_invoice.created_at at time zone 'Africa/Cairo')::date)
  where id = p_invoice_id;

  return p_invoice_id;
end;
$$;

grant execute on function public.update_invoice_info(uuid, uuid, text, text, text, date) to authenticated, service_role;

-- ── delete_invoice: manager only, voids if needed then hard-deletes ──────────
create or replace function public.delete_invoice(
  p_invoice_id uuid,
  p_deleted_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_role public.role_enum;
  i record;
begin
  select role into v_role from public.profiles where id = p_deleted_by and is_active = true;
  if v_role <> 'manager' then
    raise exception 'Only manager can delete invoices.';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.';
  end if;

  -- If confirmed, restore stock first
  if v_invoice.status = 'confirmed' then
    for i in
      select ii.product_id, ii.quantity, p.is_digital
      from public.invoice_items ii
      join public.products p on p.id = ii.product_id
      where ii.invoice_id = p_invoice_id
    loop
      if not i.is_digital then
        update public.products
        set current_stock = current_stock + i.quantity
        where id = i.product_id;

        insert into public.stock_movements (
          product_id,
          invoice_id,
          movement_type,
          quantity_delta,
          created_by,
          note
        )
        values (
          i.product_id,
          p_invoice_id,
          'void_reversal',
          i.quantity,
          p_deleted_by,
          'Invoice deleted'
        );
      end if;
    end loop;
  end if;

  -- Hard delete (invoice_items cascade, stock_movements set null)
  delete from public.invoices where id = p_invoice_id;
end;
$$;

grant execute on function public.delete_invoice(uuid, uuid) to authenticated, service_role;

-- ── Update void_invoice to skip digital products ─────────────────────────────
create or replace function public.void_invoice(
  p_invoice_id uuid,
  p_voided_by uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_role public.role_enum;
  i record;
begin
  select role into v_role from public.profiles where id = p_voided_by and is_active = true;
  if v_role <> 'manager' then
    raise exception 'Only manager can void invoices.';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found.';
  end if;

  if v_invoice.status = 'void' then
    raise exception 'Invoice already voided.';
  end if;

  update public.invoices
  set
    status = 'void',
    voided_at = now(),
    voided_by = p_voided_by,
    void_reason = nullif(trim(p_reason), '')
  where id = p_invoice_id;

  -- Restore stock only for non-digital products
  for i in
    select ii.product_id, ii.quantity, p.is_digital
    from public.invoice_items ii
    join public.products p on p.id = ii.product_id
    where ii.invoice_id = p_invoice_id
  loop
    if not i.is_digital then
      update public.products
      set current_stock = current_stock + i.quantity
      where id = i.product_id;

      insert into public.stock_movements (
        product_id,
        invoice_id,
        movement_type,
        quantity_delta,
        created_by,
        note
      )
      values (
        i.product_id,
        p_invoice_id,
        'void_reversal',
        i.quantity,
        p_voided_by,
        'Invoice void stock reversal'
      );
    end if;
  end loop;

  return p_invoice_id;
end;
$$;
