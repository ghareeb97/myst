-- ── Invoice audit log ────────────────────────────────────────────────────────
create table public.invoice_audit_log (
  id         bigint generated always as identity primary key,
  invoice_id uuid        not null references public.invoices(id) on delete cascade,
  action     text        not null,
  actor_id   uuid        references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  details    jsonb
);

create index invoice_audit_log_invoice_idx
  on public.invoice_audit_log(invoice_id, created_at desc);

alter table public.invoice_audit_log enable row level security;

create policy "Authenticated can read audit log"
  on public.invoice_audit_log for select to authenticated using (true);

-- ── Fix update_invoice_info: allow supervisor + write audit log ───────────────
create or replace function public.update_invoice_info(
  p_invoice_id      uuid,
  p_updated_by      uuid,
  p_customer_name   text default null,
  p_customer_phone  text default null,
  p_reference_number text default null,
  p_invoice_date    date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_role    public.role_enum;
  v_new_date date;
begin
  select role into v_role from public.profiles where id = p_updated_by and is_active = true;
  if v_role not in ('manager', 'supervisor') then
    raise exception 'Only manager or supervisor can edit invoice info.';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.';
  end if;
  if v_invoice.status = 'void' then
    raise exception 'Cannot edit a voided invoice.';
  end if;

  v_new_date := coalesce(
    p_invoice_date,
    v_invoice.invoice_date,
    (v_invoice.created_at at time zone 'Africa/Cairo')::date
  );

  update public.invoices
  set
    customer_name    = nullif(trim(coalesce(p_customer_name, '')), ''),
    customer_phone   = nullif(trim(coalesce(p_customer_phone, '')), ''),
    reference_number = nullif(trim(coalesce(p_reference_number, '')), ''),
    invoice_date     = v_new_date
  where id = p_invoice_id;

  insert into public.invoice_audit_log (invoice_id, action, actor_id, details)
  values (
    p_invoice_id,
    'edit_info',
    p_updated_by,
    jsonb_strip_nulls(jsonb_build_object(
      'customer_name',    nullif(trim(coalesce(p_customer_name, '')), ''),
      'customer_phone',   nullif(trim(coalesce(p_customer_phone, '')), ''),
      'reference_number', nullif(trim(coalesce(p_reference_number, '')), ''),
      'invoice_date',     v_new_date::text
    ))
  );

  return p_invoice_id;
end;
$$;

grant execute on function public.update_invoice_info(uuid, uuid, text, text, text, date)
  to authenticated, service_role;
