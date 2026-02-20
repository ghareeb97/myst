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
