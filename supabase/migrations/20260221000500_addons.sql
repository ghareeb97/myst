-- ── Add QSS and PS addon columns to invoices ─────────────────────────────────
alter table public.invoices
  add column addon_qss numeric(12, 2) null check (addon_qss >= 0),
  add column addon_ps  numeric(12, 2) null check (addon_ps  >= 0);

-- ── Remove allow_price_override (not needed) ─────────────────────────────────
alter table public.products
  drop column if exists allow_price_override;

-- ── Recreate create_invoice with addon support ────────────────────────────────
drop function if exists public.create_invoice(uuid, text, text, numeric, numeric, jsonb, text, date);

create or replace function public.create_invoice(
  p_created_by     uuid,
  p_customer_name  text,
  p_customer_phone text,
  p_discount       numeric,
  p_paid_amount    numeric,
  p_items          jsonb,
  p_reference_number text default null,
  p_invoice_date   date   default null,
  p_addon_qss      numeric default null,
  p_addon_ps       numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id    uuid;
  v_invoice_number text;
  v_subtotal      numeric(12,2) := 0;
  v_discount      numeric(12,2) := coalesce(p_discount, 0);
  v_total         numeric(12,2);
  v_paid_amount   numeric(12,2);
  v_remaining     numeric(12,2);
  v_status        public.payment_status_enum;
  v_role          public.role_enum;
  v_invoice_date  date;
  v_addon_qss     numeric(12,2);
  v_addon_ps      numeric(12,2);
  i               record;
  v_product       record;
  v_unit_price    numeric(12,2);
  product_ids     uuid[]    := '{}';
  quantities      integer[] := '{}';
  unit_prices     numeric[] := '{}';
  is_digitals     boolean[] := '{}';
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

  v_invoice_date := coalesce(p_invoice_date, (now() at time zone 'Africa/Cairo')::date);
  v_addon_qss    := case when p_addon_qss > 0 then round(p_addon_qss, 2) else null end;
  v_addon_ps     := case when p_addon_ps  > 0 then round(p_addon_ps,  2) else null end;

  for i in
    select *
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
  loop
    if i.product_id is null or i.quantity is null or i.quantity <= 0 then
      raise exception 'Each invoice line requires product_id and positive quantity.';
    end if;

    select id, sale_price, status, is_digital
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

    v_unit_price := v_product.sale_price;
    product_ids  := array_append(product_ids,  i.product_id);
    quantities   := array_append(quantities,    i.quantity);
    unit_prices  := array_append(unit_prices,   v_unit_price);
    is_digitals  := array_append(is_digitals,   v_product.is_digital);
    v_subtotal   := v_subtotal + (v_unit_price * i.quantity);
  end loop;

  -- Include addons in subtotal
  v_subtotal  := round(v_subtotal + coalesce(v_addon_qss, 0) + coalesce(v_addon_ps, 0), 2);
  v_total     := round(greatest(0, v_subtotal - v_discount), 2);

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
    invoice_number, invoice_date, created_by,
    customer_name, customer_phone, reference_number,
    subtotal, discount, total, paid_amount, remaining_amount,
    payment_status, status, addon_qss, addon_ps
  )
  values (
    v_invoice_number, v_invoice_date, p_created_by,
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_phone), ''),
    nullif(trim(coalesce(p_reference_number, '')), ''),
    v_subtotal, v_discount, v_total, v_paid_amount, v_remaining,
    v_status, 'confirmed', v_addon_qss, v_addon_ps
  )
  returning id into v_invoice_id;

  for i in 1 .. array_length(product_ids, 1) loop
    insert into public.invoice_items (invoice_id, product_id, quantity, unit_price, line_total)
    values (
      v_invoice_id, product_ids[i], quantities[i], unit_prices[i],
      round(unit_prices[i] * quantities[i], 2)
    );

    if not is_digitals[i] then
      update public.products
      set current_stock = current_stock - quantities[i]
      where id = product_ids[i];

      insert into public.stock_movements (
        product_id, invoice_id, movement_type, quantity_delta, created_by, note
      )
      values (
        product_ids[i], v_invoice_id, 'sale', -quantities[i],
        p_created_by, 'Invoice confirmation'
      );
    end if;
  end loop;

  return v_invoice_id;
end;
$$;

grant execute on function public.create_invoice(uuid, text, text, numeric, numeric, jsonb, text, date, numeric, numeric)
  to authenticated, service_role;
