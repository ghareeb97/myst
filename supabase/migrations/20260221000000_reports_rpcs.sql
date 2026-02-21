-- Sales report: daily breakdown of confirmed invoices
create or replace function public.sales_report(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  day             date,
  invoice_count   bigint,
  revenue         numeric,
  total_discount  numeric
)
language sql
security definer
set search_path = public
as $$
  with s as (
    select timezone from public.settings where id = 1
  )
  select
    (i.created_at at time zone s.timezone)::date as day,
    count(*)                                      as invoice_count,
    coalesce(sum(i.total), 0)                     as revenue,
    coalesce(sum(i.discount), 0)                  as total_discount
  from public.invoices i
  cross join s
  where i.status = 'confirmed'
    and i.created_at >= p_from
    and i.created_at <  p_to
  group by 1
  order by 1 asc;
$$;

-- Best-selling products: top N by quantity sold in confirmed invoices
create or replace function public.best_selling_products(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit int default 10
)
returns table (
  product_id   uuid,
  product_name text,
  sku          text,
  qty_sold     bigint,
  revenue      numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id                           as product_id,
    p.name                         as product_name,
    p.sku,
    sum(ii.quantity)               as qty_sold,
    coalesce(sum(ii.line_total), 0) as revenue
  from public.invoice_items ii
  join public.invoices  i on i.id = ii.invoice_id
  join public.products  p on p.id = ii.product_id
  where i.status = 'confirmed'
    and i.created_at >= p_from
    and i.created_at <  p_to
  group by p.id, p.name, p.sku
  order by qty_sold desc
  limit p_limit;
$$;

-- Net profit summary: revenue, cost, profit — split into costed vs uncosted
create or replace function public.net_profit_summary(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  total_revenue    numeric,
  costed_revenue   numeric,
  total_cost       numeric,
  gross_profit     numeric,
  uncosted_revenue numeric
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(sum(ii.line_total), 0)
      as total_revenue,
    coalesce(sum(ii.line_total) filter (where p.cost_price is not null), 0)
      as costed_revenue,
    coalesce(sum(p.cost_price * ii.quantity) filter (where p.cost_price is not null), 0)
      as total_cost,
    coalesce(sum(ii.line_total - p.cost_price * ii.quantity) filter (where p.cost_price is not null), 0)
      as gross_profit,
    coalesce(sum(ii.line_total) filter (where p.cost_price is null), 0)
      as uncosted_revenue
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  join public.products p on p.id = ii.product_id
  where i.status = 'confirmed'
    and i.created_at >= p_from
    and i.created_at <  p_to;
$$;

-- Stock movements report: detailed warehouse log
create or replace function public.stock_movements_report(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  movement_id     uuid,
  movement_type   public.stock_movement_type_enum,
  quantity_delta  integer,
  product_name    text,
  sku             text,
  invoice_number  text,
  actor           text,
  note            text,
  created_at      timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    sm.id              as movement_id,
    sm.movement_type,
    sm.quantity_delta,
    p.name             as product_name,
    p.sku,
    inv.invoice_number,
    pr.full_name       as actor,
    sm.note,
    sm.created_at
  from public.stock_movements sm
  join public.products  p   on p.id   = sm.product_id
  join public.profiles  pr  on pr.id  = sm.created_by
  left join public.invoices inv on inv.id = sm.invoice_id
  where sm.created_at >= p_from
    and sm.created_at <  p_to
  order by sm.created_at desc;
$$;

grant execute on function public.sales_report(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.best_selling_products(timestamptz, timestamptz, int) to authenticated, service_role;
grant execute on function public.net_profit_summary(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.stock_movements_report(timestamptz, timestamptz) to authenticated, service_role;
