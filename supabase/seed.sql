-- Run this after creating auth users.
-- This maps known employee emails to application roles.

insert into public.settings (id, currency, timezone, global_low_stock_threshold)
values (1, 'EGP', 'Africa/Cairo', 3)
on conflict (id) do update
set
  currency = excluded.currency,
  timezone = excluded.timezone,
  global_low_stock_threshold = excluded.global_low_stock_threshold;

insert into public.profiles (id, full_name, role, is_active)
select id, 'Myst Manager', 'manager'::public.role_enum, true
from auth.users
where email = 'manager@myst.local'
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active;

insert into public.profiles (id, full_name, role, is_active)
select id, 'Myst Sales 1', 'sales'::public.role_enum, true
from auth.users
where email = 'sales1@myst.local'
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active;

insert into public.profiles (id, full_name, role, is_active)
select id, 'Myst Sales 2', 'sales'::public.role_enum, true
from auth.users
where email = 'sales2@myst.local'
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active;

-- ── Sample online order (local testing only) ─────────────────────────────────
-- No real file sits behind file_path, so downloads for this order show "missing file".
with lines as (
  select s.size_cm, s.product_id, v.qty, p.sale_price, v.file_name
  from (values ('10x15', 2, 'beach.jpg'), ('13x18', 1, 'family.jpg')) as v(size_cm, qty, file_name)
  join public.online_print_sizes s on s.size_cm = v.size_cm
  join public.products p on p.id = s.product_id
),
o as (
  insert into public.orders (code, upload_id, customer_name, customer_phone, delivery_method, payment_method, total, notes)
  select 'MS-SAMPLE23', '00000000-0000-4000-8000-000000000001', 'Sample Customer', '01001234567',
         'pickup', 'pay_at_pickup', sum(sale_price * qty), 'Seeded sample order'
  from lines
  on conflict (code) do nothing
  returning id
)
insert into public.order_items (order_id, size_cm, product_id, quantity, unit_price, line_total, file_path, file_name)
select o.id, l.size_cm, l.product_id, l.qty, l.sale_price, l.sale_price * l.qty,
       'pending/00000000-0000-4000-8000-000000000001/' || l.file_name, l.file_name
from o cross join lines l;
