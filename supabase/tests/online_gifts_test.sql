-- pgTAP tests for online gift orders (20261122140000_online_gifts.sql).
-- Runs in one transaction and rolls back, so it is safe on the shared local database:
--   docker exec -i supabase_db_myst psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/online_gifts_test.sql
-- (or `npx supabase test db`). Covers anon (the website), a self-registered user with no staff
-- profile, active staff and service_role, for both print and gift lines.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(45);

-- ── Fixtures (as postgres) ────────────────────────────────────────────────────
-- Files the customer "uploaded". U1 = the main mixed order, U2 = error cases, U3 = print only,
-- U9 = someone else's folder.
insert into storage.objects (bucket_id, name) values
  ('order-uploads', 'pending/a0000000-0000-4000-8000-000000000001/001-beach.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-000000000001/g-k3x9-mama.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-000000000002/001-a.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-000000000002/g-a.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-000000000003/001-only.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-000000000009/g-other.jpg');

-- The mixed order: 2 × 10x15 print (25) + 1 magic mug with photo and text (150)
-- + 2 white mugs with a name only (100) = 400.
create temp table mixed_items as select $$[
  {"path": "pending/a0000000-0000-4000-8000-000000000001/001-beach.jpg", "file_name": "beach.jpg", "size_cm": "10x15", "quantity": 2},
  {"kind": "gift", "slug": "magic-mug", "quantity": 1, "path": "pending/a0000000-0000-4000-8000-000000000001/g-k3x9-mama.jpg", "file_name": "mama.jpg", "text": "  Mama \n  Love "},
  {"kind": "gift", "slug": "white-mug", "quantity": 2, "text": "سارة"}
]$$::jsonb as items;
grant select on mixed_items to anon, authenticated, service_role;

-- Calls submit_order for upload U2 with one set of items (for the error cases).
create function pg_temp.try_items(p_items text) returns jsonb language sql as $$
  select public.submit_order('a0000000-0000-4000-8000-000000000002', 'Sara', '01001234567', 'pickup', null, null, null, p_items::jsonb)
$$;
grant execute on function pg_temp.try_items(text) to anon;

-- ── anon (the public website) ─────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is((select count(*)::int from public.online_gift_prices()), 14, 'anon: 14 gifts are offered online');
select is((select price from public.online_gift_prices() where slug = 'magic-mug'), 150.00::numeric, 'anon: gift price comes from products');
select is((select personalization from public.online_gift_prices() where slug = 'magic-mug'), 'photo', 'anon: personalization is returned');
select ok(not exists (select 1 from public.online_gift_prices() where slug in ('thermal-bottle', 'tshirt-print')), 'anon: variant gifts stay off the online list');
select throws_ok('select * from public.online_gift_products', '42501', null, 'anon: cannot read online_gift_products');
select throws_ok('select * from public.order_items', '42501', null, 'anon: cannot read order_items');

select is(
  (public.submit_order('a0000000-0000-4000-8000-000000000001', 'Sara Ali', '٠١٠٠١٢٣٤٥٦٧', 'pickup', null, null, null,
                       (select items from mixed_items)) ->> 'total')::numeric,
  400::numeric,
  'anon: a mixed print + gift order is priced by the server'
);
select is(
  public.submit_order('a0000000-0000-4000-8000-000000000001', 'Sara Ali', '01001234567', 'pickup', null, null, null,
                      (select items from mixed_items)) ->> 'existing',
  'true',
  'anon: retrying the same upload id returns the existing order'
);
select is(
  public.order_status_public(
    public.submit_order('a0000000-0000-4000-8000-000000000001', 'x', 'x', 'x', null, null, null, '[]') ->> 'code'
  ) - 'code' - 'status' - 'created_at' - 'updated_at',
  '{"delivery_method": "pickup", "total": 400.00, "photos": 1, "prints": 2, "gifts": 3}'::jsonb,
  'anon: tracking counts print photos, copies and gift pieces separately'
);

-- Print-only orders in the old payload shape (no "kind") still work.
select is(
  (public.submit_order('a0000000-0000-4000-8000-000000000003', 'Omar', '01001234567', 'pickup', null, null, null,
    '[{"path": "pending/a0000000-0000-4000-8000-000000000003/001-only.jpg", "file_name": "only.jpg", "size_cm": "10x15", "quantity": 1}]'
  ) ->> 'total')::numeric,
  25::numeric,
  'anon: a print-only order without "kind" still works'
);

-- Error codes, old and new.
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "thermal-bottle", "quantity": 1, "text": "Ali"}]')$$,
  'P0001', 'unknown_gift', 'gift not offered online');
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "nope", "quantity": 1, "text": "Ali"}]')$$,
  'P0001', 'unknown_gift', 'unknown gift slug');
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "magic-mug", "quantity": 1, "text": "Ali"}]')$$,
  'P0001', 'photo_required', 'photo gift without a photo');
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "white-mug", "quantity": 1, "text": "   "}]')$$,
  'P0001', 'personalization_required', 'photo-or-text gift with neither');
select throws_ok(format($$select pg_temp.try_items('[{"kind": "gift", "slug": "white-mug", "quantity": 1, "text": "%s"}]')$$, repeat('a', 41)),
  'P0001', 'invalid_text', 'text longer than the gift allows');
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "white-mug", "quantity": 1, "text": "a\u0007b"}]')$$,
  'P0001', 'invalid_text', 'control characters in the text');
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "white-mug", "quantity": 0, "text": "Ali"}]')$$,
  'P0001', 'invalid_quantity', 'gift quantity 0');
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "white-mug", "quantity": 2.5, "text": "Ali"}]')$$,
  'P0001', 'invalid_quantity', 'gift quantity 2.5');
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "white-mug", "quantity": 51, "text": "Ali"}]')$$,
  'P0001', 'invalid_quantity', 'gift quantity 51');
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "magic-mug", "quantity": 1, "path": "pending/a0000000-0000-4000-8000-000000000002/g-missing.jpg"}]')$$,
  'P0001', 'missing_file', 'gift photo that was never uploaded');
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "magic-mug", "quantity": 1, "path": "pending/a0000000-0000-4000-8000-000000000009/g-other.jpg"}]')$$,
  'P0001', 'invalid_path', 'gift photo from another upload folder');
select throws_ok($$select pg_temp.try_items('[{"kind": "gift", "slug": "magic-mug", "quantity": 1, "path": "pending/a0000000-0000-4000-8000-000000000002/../a0000000-0000-4000-8000-000000000009/g-other.jpg"}]')$$,
  'P0001', 'invalid_path', 'gift photo path with ..');
select throws_ok($$select pg_temp.try_items('[
    {"path": "pending/a0000000-0000-4000-8000-000000000002/001-a.jpg", "size_cm": "10x15", "quantity": 1},
    {"kind": "gift", "slug": "magic-mug", "quantity": 1, "path": "pending/a0000000-0000-4000-8000-000000000002/001-a.jpg"}
  ]')$$,
  'P0001', 'duplicate_file', 'a print and a gift cannot share one file');
select throws_ok($$select pg_temp.try_items('[{"kind": "box", "slug": "white-mug", "quantity": 1, "text": "Ali"}]')$$,
  'P0001', 'invalid_items', 'unknown line kind');
select throws_ok($$select pg_temp.try_items('["not an object"]')$$,
  'P0001', 'invalid_items', 'a line that is not an object');
select throws_ok(
  format('select pg_temp.try_items(%L)',
    (select jsonb_agg(jsonb_build_object('kind', 'gift', 'slug', 'white-mug', 'quantity', 1, 'text', 'Ali')) from generate_series(1, 21))),
  'P0001', 'invalid_items', 'more than 20 gift lines');
select throws_ok($$select pg_temp.try_items('[]')$$, 'P0001', 'invalid_items', 'empty order');
select throws_ok($$select pg_temp.try_items('[{"path": "pending/a0000000-0000-4000-8000-000000000002/001-a.jpg", "size_cm": "9x9", "quantity": 1}]')$$,
  'P0001', 'unknown_size', 'print with an unknown size (unchanged)');
select throws_ok($$select pg_temp.try_items('[{"path": "pending/a0000000-0000-4000-8000-000000000002/missing.jpg", "size_cm": "10x15", "quantity": 1}]')$$,
  'P0001', 'missing_file', 'print photo that was never uploaded (unchanged)');
select throws_ok($$select public.submit_order('a0000000-0000-4000-8000-000000000002', 'S', '01001234567', 'pickup', null, null, null, '[{"kind": "box"}]')$$,
  'P0001', 'invalid_name', 'name is still checked before the items');

-- ── Stored rows (as postgres) ─────────────────────────────────────────────────
reset role;

select results_eq(
  $$select i.kind, i.gift_slug, i.size_cm, i.quantity, i.unit_price, i.personal_text, i.file_name
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.upload_id = 'a0000000-0000-4000-8000-000000000001' order by i.line_no$$,
  $$values ('print', null::text, '10x15'::text, 2, 25.00::numeric, null::text, 'beach.jpg'::text),
           ('gift', 'magic-mug', null, 1, 150.00, 'Mama Love', 'mama.jpg'),
           ('gift', 'white-mug', null, 2, 100.00, 'سارة', null)$$,
  'lines are stored in order, gift text is cleaned, a name-only gift has no file'
);
select is(
  (select customer_phone from public.orders where upload_id = 'a0000000-0000-4000-8000-000000000001'),
  '01001234567', 'Arabic-Indic phone digits are stored clean'
);
select is(
  (select details from public.order_events e join public.orders o on o.id = e.order_id
   where o.upload_id = 'a0000000-0000-4000-8000-000000000001' and e.action = 'created'),
  '{"items": 3, "prints": 1, "gifts": 2, "total": 400.00}'::jsonb,
  'the created event records print and gift line counts'
);
select throws_ok(
  $$insert into public.order_items (order_id, kind, product_id, quantity, unit_price, line_total, personal_text)
    select o.id, 'gift', p.id, 1, 1, 1, 'x' from public.orders o, public.products p
    where o.upload_id = 'a0000000-0000-4000-8000-000000000001' and p.sku = 'GIFT-WHITE-MUG'$$,
  '23514', null, 'a gift line needs a gift slug'
);
select throws_ok(
  $$insert into public.order_items (order_id, kind, gift_slug, product_id, quantity, unit_price, line_total)
    select o.id, 'gift', 'white-mug', p.id, 1, 1, 1 from public.orders o, public.products p
    where o.upload_id = 'a0000000-0000-4000-8000-000000000001' and p.sku = 'GIFT-WHITE-MUG'$$,
  '23514', null, 'a gift line needs a photo or a text'
);

-- ── Self-registered user with no staff profile ────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated", "sub": "b0000000-0000-4000-8000-00000000000b"}';

select is((select count(*)::int from public.online_gift_products), 0, 'non-staff: sees no online gift rows');
select is((select count(*)::int from public.order_items), 0, 'non-staff: sees no order lines');
select is((select count(*)::int from public.online_gift_prices()), 14, 'non-staff: public gift prices still work');
select throws_ok($$insert into public.online_gift_products (slug, product_id, personalization) select 'x', id, 'photo' from public.products limit 1$$,
  '42501', null, 'non-staff: cannot add online gifts');
select throws_ok($$select public.confirm_order_to_invoice(gen_random_uuid(), gen_random_uuid(), null)$$,
  '42501', null, 'non-staff: cannot confirm orders');

-- ── Active staff (manager) ────────────────────────────────────────────────────
reset role;
select null from set_config('request.jwt.claims',
  jsonb_build_object('role', 'authenticated', 'sub', (select id from public.profiles where role = 'manager' and is_active limit 1))::text,
  true);
set local role authenticated;

select is((select count(*)::int from public.online_gift_products), 14, 'staff: can read online gifts');
select throws_ok($$update public.online_gift_products set active = false$$, '42501', null, 'staff: cannot edit online gifts directly');

-- ── service_role (myst API routes) ────────────────────────────────────────────
reset role;
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

select lives_ok(
  $$select public.confirm_order_to_invoice(
      (select id from public.orders where upload_id = 'a0000000-0000-4000-8000-000000000001'),
      (select id from public.profiles where role = 'manager' and is_active limit 1),
      null)$$,
  'service_role: a mixed order confirms into an invoice'
);
select results_eq(
  $$select p.sku, ii.quantity from public.invoice_items ii
      join public.products p on p.id = ii.product_id
      join public.orders o on o.invoice_id = ii.invoice_id
    where o.upload_id = 'a0000000-0000-4000-8000-000000000001' order by p.sku$$,
  $$values ('GIFT-MAGIC-MUG'::text, 1), ('GIFT-WHITE-MUG', 2), ('PRINT-10X15', 2)$$,
  'service_role: the invoice has one line per product, gifts included'
);
select is(
  (select i.total from public.invoices i join public.orders o on o.invoice_id = i.id
   where o.upload_id = 'a0000000-0000-4000-8000-000000000001'),
  400.00::numeric, 'service_role: invoice total matches the order total'
);

select * from finish();
rollback;
