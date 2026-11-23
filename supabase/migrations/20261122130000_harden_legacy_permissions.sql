-- Harden the permissions on the original myst tables and functions, the same way the
-- online-orders migrations already do for their own objects.
--
-- Why: the public website (mystudio-web) ships the anon key, and Auth sign-up is open, so
-- anyone can get an `authenticated` session without being staff. Before this migration such
-- a user could read every invoice (customer names and phones), call the staff RPCs with a
-- manager's profile id, and run the report functions.
--
-- After this migration:
--   * anon has no access to these tables.
--   * authenticated can only SELECT, and RLS only returns rows to active staff
--     (current_user_role() is not null). A user can still read their own profile row so the
--     app can tell an inactive account apart from a missing one.
--   * Every write and every report goes through the service role (the Next.js API routes and
--     server pages call createSupabaseAdminClient() after requireAuth/requireApiUser).

-- ── 1. Table and sequence privileges ────────────────────────────────────────
revoke all on table
  public.settings,
  public.profiles,
  public.products,
  public.invoices,
  public.invoice_items,
  public.stock_movements,
  public.invoice_audit_log
from anon, authenticated;

grant select on table
  public.settings,
  public.profiles,
  public.products,
  public.invoices,
  public.invoice_items,
  public.stock_movements,
  public.invoice_audit_log
to authenticated;

grant all privileges on table
  public.settings,
  public.profiles,
  public.products,
  public.invoices,
  public.invoice_items,
  public.stock_movements,
  public.invoice_audit_log
to service_role;

-- The online-orders tables already restrict reads to staff; drop the write privileges that
-- Supabase's default grants left on them too (RLS blocked the writes, this removes the grant).
revoke insert, update, delete, truncate, references, trigger on table
  public.online_print_sizes,
  public.orders,
  public.order_items,
  public.order_events
from authenticated;

revoke all on sequence
  public.invoice_number_seq,
  public.invoice_audit_log_id_seq,
  public.order_events_id_seq
from anon, authenticated;

grant usage, select on sequence
  public.invoice_number_seq,
  public.invoice_audit_log_id_seq,
  public.order_events_id_seq
to service_role;

-- ── 2. Read policies: active staff only ─────────────────────────────────────
-- current_user_role() is SECURITY DEFINER (owned by the table owner), so using it in the
-- profiles policy does not recurse. Wrapping it in a sub-select lets Postgres evaluate it once
-- per query instead of once per row.
drop policy if exists "settings_read_authenticated" on public.settings;
create policy "settings_read_staff" on public.settings
for select to authenticated
using ((select public.current_user_role()) is not null);

drop policy if exists "profiles_read_authenticated" on public.profiles;
create policy "profiles_read_staff_or_self" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select public.current_user_role()) is not null);

drop policy if exists "products_read_authenticated" on public.products;
create policy "products_read_staff" on public.products
for select to authenticated
using ((select public.current_user_role()) is not null);

drop policy if exists "invoices_read_authenticated" on public.invoices;
create policy "invoices_read_staff" on public.invoices
for select to authenticated
using ((select public.current_user_role()) is not null);

drop policy if exists "invoice_items_read_authenticated" on public.invoice_items;
create policy "invoice_items_read_staff" on public.invoice_items
for select to authenticated
using ((select public.current_user_role()) is not null);

drop policy if exists "stock_movements_read_authenticated" on public.stock_movements;
create policy "stock_movements_read_staff" on public.stock_movements
for select to authenticated
using ((select public.current_user_role()) is not null);

drop policy if exists "Authenticated can read audit log" on public.invoice_audit_log;
create policy "invoice_audit_log_read_staff" on public.invoice_audit_log
for select to authenticated
using ((select public.current_user_role()) is not null);

-- ── 3. Functions: service role only ─────────────────────────────────────────
-- Staff RPCs take the acting profile id as an argument, so they must never be callable with a
-- user JWT. Report RPCs have no role check of their own; the app calls them from manager-only
-- pages and API routes through the service role. Every overload is covered in case an older
-- create_invoice signature survived on some database.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_invoice',
        'void_invoice',
        'update_invoice_payment',
        'update_invoice_info',
        'delete_invoice',
        'next_invoice_number',
        'sales_report',
        'best_selling_products',
        'net_profit_summary',
        'stock_movements_report',
        'dashboard_metrics',
        'low_stock_items'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
