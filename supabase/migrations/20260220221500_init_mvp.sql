create extension if not exists pgcrypto;

create type public.role_enum as enum ('manager', 'sales');
create type public.payment_status_enum as enum ('paid', 'partially_paid', 'unpaid');
create type public.product_status_enum as enum ('active', 'inactive');
create type public.invoice_status_enum as enum ('confirmed', 'void');
create type public.stock_movement_type_enum as enum ('sale', 'void_reversal', 'adjustment');

create table public.settings (
  id integer primary key default 1 check (id = 1),
  currency text not null default 'EGP',
  timezone text not null default 'Africa/Cairo',
  global_low_stock_threshold integer not null default 3 check (global_low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.role_enum not null default 'sales',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text null,
  sale_price numeric(12, 2) not null check (sale_price >= 0),
  cost_price numeric(12, 2) null check (cost_price >= 0),
  current_stock integer not null default 0,
  low_stock_threshold integer null check (low_stock_threshold >= 0),
  status public.product_status_enum not null default 'active',
  created_by uuid null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.invoice_number_seq start 1 increment 1;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  customer_name text null,
  customer_phone text null,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  total numeric(12, 2) not null check (total >= 0),
  paid_amount numeric(12, 2) not null check (paid_amount >= 0),
  remaining_amount numeric(12, 2) not null check (remaining_amount >= 0),
  payment_status public.payment_status_enum not null,
  status public.invoice_status_enum not null default 'confirmed',
  voided_at timestamptz null,
  voided_by uuid null references public.profiles (id),
  void_reason text null,
  updated_at timestamptz not null default now()
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  invoice_id uuid null references public.invoices (id) on delete set null,
  movement_type public.stock_movement_type_enum not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  created_by uuid not null references public.profiles (id),
  note text null,
  created_at timestamptz not null default now()
);

create index idx_products_name on public.products (name);
create index idx_products_sku on public.products (sku);
create index idx_invoices_created_at on public.invoices (created_at desc);
create index idx_invoices_payment_status on public.invoices (payment_status);
create index idx_invoice_items_invoice_id on public.invoice_items (invoice_id);
create index idx_stock_movements_product_id on public.stock_movements (product_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_settings_updated_at
before update on public.settings
for each row execute procedure public.set_updated_at();

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

create trigger trg_products_updated_at
before update on public.products
for each row execute procedure public.set_updated_at();

create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute procedure public.set_updated_at();

insert into public.settings (id, currency, timezone, global_low_stock_threshold)
values (1, 'EGP', 'Africa/Cairo', 3)
on conflict (id) do update
set
  currency = excluded.currency,
  timezone = excluded.timezone,
  global_low_stock_threshold = excluded.global_low_stock_threshold;

create or replace function public.current_user_role()
returns public.role_enum
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
  limit 1;
$$;

create or replace function public.next_invoice_number()
returns text
language plpgsql
as $$
declare
  seq_no bigint;
  tz text;
begin
  select timezone into tz from public.settings where id = 1;
  seq_no := nextval('public.invoice_number_seq');
  return 'INV-' || to_char(now() at time zone coalesce(tz, 'Africa/Cairo'), 'YYYYMMDD') || '-' || lpad(seq_no::text, 6, '0');
end;
$$;

create or replace function public.create_invoice(
  p_created_by uuid,
  p_customer_name text,
  p_customer_phone text,
  p_discount numeric,
  p_paid_amount numeric,
  p_items jsonb
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
  i record;
  v_product record;
  product_ids uuid[] := '{}';
  quantities integer[] := '{}';
  unit_prices numeric[] := '{}';
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

  for i in
    select *
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer)
  loop
    if i.product_id is null or i.quantity is null or i.quantity <= 0 then
      raise exception 'Each invoice line requires product_id and positive quantity.';
    end if;

    select id, sale_price, status
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

    product_ids := array_append(product_ids, i.product_id);
    quantities := array_append(quantities, i.quantity);
    unit_prices := array_append(unit_prices, v_product.sale_price);
    v_subtotal := v_subtotal + (v_product.sale_price * i.quantity);
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
    created_by,
    customer_name,
    customer_phone,
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
    p_created_by,
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_phone), ''),
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
  end loop;

  return v_invoice_id;
end;
$$;

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

  for i in
    select product_id, quantity
    from public.invoice_items
    where invoice_id = p_invoice_id
  loop
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
  end loop;

  return p_invoice_id;
end;
$$;

create or replace function public.update_invoice_payment(
  p_invoice_id uuid,
  p_paid_amount numeric,
  p_updated_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_role public.role_enum;
  v_paid numeric(12,2);
  v_remaining numeric(12,2);
  v_status public.payment_status_enum;
begin
  select role into v_role from public.profiles where id = p_updated_by and is_active = true;
  if v_role <> 'manager' then
    raise exception 'Only manager can edit payment.';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found.';
  end if;

  if v_invoice.status = 'void' then
    raise exception 'Cannot edit payment on void invoice.';
  end if;

  v_paid := round(greatest(0, coalesce(p_paid_amount, 0)), 2);
  if v_paid > v_invoice.total then
    raise exception 'Paid amount cannot exceed total.';
  end if;

  v_remaining := round(v_invoice.total - v_paid, 2);
  if v_paid = 0 then
    v_status := 'unpaid';
  elsif v_paid = v_invoice.total then
    v_status := 'paid';
  else
    v_status := 'partially_paid';
  end if;

  update public.invoices
  set
    paid_amount = v_paid,
    remaining_amount = v_remaining,
    payment_status = v_status
  where id = p_invoice_id;

  return p_invoice_id;
end;
$$;

create or replace function public.low_stock_items()
returns table (
  id uuid,
  sku text,
  name text,
  current_stock integer,
  threshold integer
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.sku,
    p.name,
    p.current_stock,
    coalesce(p.low_stock_threshold, s.global_low_stock_threshold) as threshold
  from public.products p
  cross join public.settings s
  where p.status = 'active'
    and p.current_stock <= coalesce(p.low_stock_threshold, s.global_low_stock_threshold)
  order by p.current_stock asc, p.name asc;
$$;

create or replace function public.dashboard_metrics()
returns table (
  invoices_today bigint,
  invoices_month bigint,
  revenue_today numeric,
  revenue_month numeric,
  low_stock_count bigint
)
language sql
security definer
set search_path = public
as $$
  with s as (
    select timezone, global_low_stock_threshold from public.settings where id = 1
  ),
  agg as (
    select
      count(*) filter (
        where i.status = 'confirmed'
          and (i.created_at at time zone s.timezone) >= date_trunc('day', now() at time zone s.timezone)
      ) as invoices_today,
      count(*) filter (
        where i.status = 'confirmed'
          and (i.created_at at time zone s.timezone) >= date_trunc('month', now() at time zone s.timezone)
      ) as invoices_month,
      coalesce(sum(i.total) filter (
        where i.status = 'confirmed'
          and (i.created_at at time zone s.timezone) >= date_trunc('day', now() at time zone s.timezone)
      ), 0) as revenue_today,
      coalesce(sum(i.total) filter (
        where i.status = 'confirmed'
          and (i.created_at at time zone s.timezone) >= date_trunc('month', now() at time zone s.timezone)
      ), 0) as revenue_month
    from public.invoices i
    cross join s
  ),
  low as (
    select count(*) as low_stock_count
    from public.products p
    cross join s
    where p.status = 'active'
      and p.current_stock <= coalesce(p.low_stock_threshold, s.global_low_stock_threshold)
  )
  select
    agg.invoices_today,
    agg.invoices_month,
    agg.revenue_today,
    agg.revenue_month,
    low.low_stock_count
  from agg cross join low;
$$;

alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.stock_movements enable row level security;

create policy "settings_read_authenticated" on public.settings
for select to authenticated using (true);

create policy "settings_update_manager" on public.settings
for update to authenticated using (public.current_user_role() = 'manager')
with check (public.current_user_role() = 'manager');

create policy "profiles_read_authenticated" on public.profiles
for select to authenticated using (true);

create policy "profiles_update_manager" on public.profiles
for update to authenticated using (public.current_user_role() = 'manager')
with check (public.current_user_role() = 'manager');

create policy "products_read_authenticated" on public.products
for select to authenticated using (true);

create policy "products_insert_manager" on public.products
for insert to authenticated with check (public.current_user_role() = 'manager');

create policy "products_update_manager" on public.products
for update to authenticated using (public.current_user_role() = 'manager')
with check (public.current_user_role() = 'manager');

create policy "invoices_read_authenticated" on public.invoices
for select to authenticated using (true);

create policy "invoice_items_read_authenticated" on public.invoice_items
for select to authenticated using (true);

create policy "stock_movements_read_authenticated" on public.stock_movements
for select to authenticated using (true);

grant usage on schema public to anon, authenticated, service_role;
grant select on public.settings to authenticated;
grant select on public.profiles to authenticated;
grant select on public.products to authenticated;
grant select on public.invoices to authenticated;
grant select on public.invoice_items to authenticated;
grant select on public.stock_movements to authenticated;

grant all privileges on public.settings to service_role;
grant all privileges on public.profiles to service_role;
grant all privileges on public.products to service_role;
grant all privileges on public.invoices to service_role;
grant all privileges on public.invoice_items to service_role;
grant all privileges on public.stock_movements to service_role;
grant usage, select on sequence public.invoice_number_seq to service_role;

grant execute on function public.next_invoice_number() to authenticated, service_role;
grant execute on function public.create_invoice(uuid, text, text, numeric, numeric, jsonb) to authenticated, service_role;
grant execute on function public.void_invoice(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.update_invoice_payment(uuid, numeric, uuid) to authenticated, service_role;
grant execute on function public.low_stock_items() to authenticated, service_role;
grant execute on function public.dashboard_metrics() to authenticated, service_role;
