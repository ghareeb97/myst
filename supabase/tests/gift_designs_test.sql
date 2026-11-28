-- pgTAP tests for the gift designer, Phase A (20261128100000_gift_designs.sql).
-- Runs in one transaction and rolls back, so it is safe on the shared local database:
--   docker exec -i supabase_db_myst psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/gift_designs_test.sql
-- (or `npx supabase test db`).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

-- ── Fixtures (as postgres) ────────────────────────────────────────────────────
-- Upload folders: D1 = designed white mug, D2 = error cases (every call there must fail),
-- D3 = old path-only gift, D4 = text-only gift with a design, D9 = someone else's folder.
insert into storage.objects (bucket_id, name) values
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d1/g-render.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d1/o-0.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d1/o-1.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d1/o-2.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d1/o-3.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d1/unused.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d2/r.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d2/p0.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d2/p1.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d3/g.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d3/p.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d4/r.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000d9/x.jpg');

-- No live gift is text-only yet, so add one for this test (rolled back).
insert into public.online_gift_products (slug, product_id, personalization, sort)
select 'name-sign', id, 'text', 99 from public.products where sku = 'GIFT-NOTEBOOK-A6';

-- A valid one-photo design in folder D2; error cases change one thing in it.
create function pg_temp.base() returns jsonb language sql as $$
  select '{"v": 1, "template": "white-mug", "rev": 1, "layout": "single",
           "photos": [{"slot": 0, "path": "pending/a0000000-0000-4000-8000-0000000000d2/p0.jpg", "w": 10, "h": 10,
                       "crop": {"x": 0, "y": 0, "s": 1}}],
           "text": {"font": "cairo", "color": "#000000"}}'::jsonb
$$;

-- One designed gift line for upload D2 (rendered file r.jpg unless another path is given).
create function pg_temp.try_design(
  p_slug text, p_design jsonb, p_path text default 'pending/a0000000-0000-4000-8000-0000000000d2/r.jpg'
) returns jsonb language sql as $$
  select public.submit_order('a0000000-0000-4000-8000-0000000000d2', 'Sara', '01001234567', 'pickup', null, null, null,
    jsonb_build_array(jsonb_build_object('kind', 'gift', 'slug', p_slug, 'quantity', 1, 'path', p_path, 'text', 'Ali', 'design', p_design)))
$$;

create function pg_temp.try_items(p_items jsonb) returns jsonb language sql as $$
  select public.submit_order('a0000000-0000-4000-8000-0000000000d2', 'Sara', '01001234567', 'pickup', null, null, null, p_items)
$$;

grant execute on function pg_temp.base() to anon;
grant execute on function pg_temp.try_design(text, jsonb, text) to anon;
grant execute on function pg_temp.try_items(jsonb) to anon;

-- ── anon (the public website) ─────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is((select max_photos from public.online_gift_prices() where slug = 'white-mug'), 4, 'anon: mugs take up to 4 photos');
select is((select max_photos from public.online_gift_prices() where slug = 'coaster'), 1, 'anon: coasters take 1 photo');

-- A quad white mug, 2 pieces (100 each). Photos arrive out of order, with unknown keys and an upper-case color.
select is(
  (public.submit_order('a0000000-0000-4000-8000-0000000000d1', 'Mona', '01001234567', 'pickup', null, null, null,
    $$[{"kind": "gift", "slug": "white-mug", "quantity": 2,
        "path": "pending/a0000000-0000-4000-8000-0000000000d1/g-render.jpg", "file_name": "design.jpg", "text": " Mama ",
        "design": {"v": 1, "template": "white-mug", "rev": 1, "layout": "quad", "extra": "drop me",
          "photos": [
            {"slot": 1, "path": "pending/a0000000-0000-4000-8000-0000000000d1/o-1.jpg", "file_name": "b.jpg", "w": 800, "h": 600,
             "crop": {"x": 0.25, "y": -0.5, "s": 1.5, "junk": 1}, "note": "drop me"},
            {"slot": 0, "path": "pending/a0000000-0000-4000-8000-0000000000d1/o-0.jpg", "file_name": "a.jpg", "w": 4000, "h": 3000,
             "crop": {"x": 0, "y": 0, "s": 1}},
            {"slot": 3, "path": "pending/a0000000-0000-4000-8000-0000000000d1/o-3.jpg", "w": 1, "h": 1,
             "crop": {"x": 1, "y": -1, "s": 5}},
            {"slot": 2, "path": "pending/a0000000-0000-4000-8000-0000000000d1/o-2.jpg", "file_name": "c.jpg", "w": 30, "h": 40,
             "crop": {"x": -1, "y": 1, "s": 2.123456}}
          ],
          "text": {"font": "amiri", "color": "#7D582B", "size": 99}}}]$$::jsonb
  ) ->> 'total')::numeric,
  200::numeric,
  'anon: a designed gift is accepted and priced by the server'
);

select is(
  (public.submit_order('a0000000-0000-4000-8000-0000000000d4', 'Omar', '01001234567', 'pickup', null, null, null,
    $$[{"kind": "gift", "slug": "name-sign", "quantity": 1, "path": "pending/a0000000-0000-4000-8000-0000000000d4/r.jpg", "text": "Omar",
        "design": {"v": 1, "template": "name-sign", "rev": 2, "layout": "name", "photos": [], "text": {"font": "ruqaa", "color": "#ffffff"}}}]$$::jsonb
  ) ->> 'total')::numeric,
  75::numeric,
  'anon: a text-only gift may carry its rendered design file'
);

select is(
  (public.submit_order('a0000000-0000-4000-8000-0000000000d3', 'Omar', '01001234567', 'pickup', null, null, null,
    $$[{"kind": "gift", "slug": "magic-mug", "quantity": 1, "path": "pending/a0000000-0000-4000-8000-0000000000d3/g.jpg", "file_name": "g.jpg"},
       {"path": "pending/a0000000-0000-4000-8000-0000000000d3/p.jpg", "file_name": "p.jpg", "size_cm": "10x15", "quantity": 1}]$$::jsonb
  ) ->> 'total')::numeric,
  175::numeric,
  'anon: old path-only gift lines and print lines still work'
);

-- Paths and files.
select throws_ok($$select pg_temp.try_design('white-mug', jsonb_set(pg_temp.base(), '{photos,0,path}', '"pending/a0000000-0000-4000-8000-0000000000d9/x.jpg"'))$$,
  'P0001', 'invalid_path', 'design photo from another upload folder');
select throws_ok($$select pg_temp.try_design('white-mug', jsonb_set(pg_temp.base(), '{photos,0,path}', '"pending/a0000000-0000-4000-8000-0000000000d2/../a0000000-0000-4000-8000-0000000000d9/x.jpg"'))$$,
  'P0001', 'invalid_path', 'design photo path with ..');
select throws_ok($$select pg_temp.try_design('white-mug', jsonb_set(pg_temp.base(), '{photos,0,path}', '"pending/a0000000-0000-4000-8000-0000000000d2/nope.jpg"'))$$,
  'P0001', 'missing_file', 'design photo that was never uploaded');

-- Photo counts.
select throws_ok($$select pg_temp.try_design('coaster', jsonb_insert(pg_temp.base(), '{photos,1}',
    '{"slot": 1, "path": "pending/a0000000-0000-4000-8000-0000000000d2/p1.jpg", "w": 10, "h": 10, "crop": {"x": 0, "y": 0, "s": 1}}'))$$,
  'P0001', 'too_many_photos', 'more photos than the gift takes');
select throws_ok($$select pg_temp.try_design('name-sign', pg_temp.base())$$,
  'P0001', 'too_many_photos', 'a text-only gift design cannot hold photos');

-- Shape.
select throws_ok($$select pg_temp.try_design('white-mug', jsonb_set(pg_temp.base(), '{text,font}', '"comic"'))$$,
  'P0001', 'invalid_design', 'unknown font');
select throws_ok($$select pg_temp.try_design('white-mug', jsonb_set(pg_temp.base(), '{text,color}', '"red"'))$$,
  'P0001', 'invalid_design', 'color that is not #rrggbb');
select throws_ok($$select pg_temp.try_design('white-mug', pg_temp.base() || jsonb_build_object('pad', repeat('x', 4100)))$$,
  'P0001', 'invalid_design', 'design larger than 4 KB');
select throws_ok($$select pg_temp.try_design('white-mug', jsonb_insert(pg_temp.base(), '{photos,1}',
    '{"slot": 0, "path": "pending/a0000000-0000-4000-8000-0000000000d2/p1.jpg", "w": 10, "h": 10, "crop": {"x": 0, "y": 0, "s": 1}}'))$$,
  'P0001', 'invalid_design', 'two photos in one slot');
select throws_ok($$select pg_temp.try_design('white-mug', jsonb_set(pg_temp.base(), '{photos,0,crop,s}', '6'))$$,
  'P0001', 'invalid_design', 'zoom outside 1..5');
select throws_ok($$select pg_temp.try_design('white-mug', jsonb_set(pg_temp.base(), '{v}', '2'))$$,
  'P0001', 'invalid_design', 'unknown design version');
select throws_ok($$select pg_temp.try_design('white-mug', pg_temp.base(), null)$$,
  'P0001', 'invalid_design', 'a design needs the rendered print file');

-- Personalization follows the design's photos.
select throws_ok($$select pg_temp.try_design('magic-mug', jsonb_set(pg_temp.base(), '{photos}', '[]'))$$,
  'P0001', 'photo_required', 'photo gift whose design has no photo');

-- Files are distinct across the whole order.
select throws_ok($$select pg_temp.try_design('white-mug', pg_temp.base(), 'pending/a0000000-0000-4000-8000-0000000000d2/p0.jpg')$$,
  'P0001', 'duplicate_file', 'the print file cannot also be a design photo');
select throws_ok($$select pg_temp.try_items(jsonb_build_array(
    '{"path": "pending/a0000000-0000-4000-8000-0000000000d2/p0.jpg", "size_cm": "10x15", "quantity": 1}'::jsonb,
    jsonb_build_object('kind', 'gift', 'slug', 'white-mug', 'quantity', 1,
                       'path', 'pending/a0000000-0000-4000-8000-0000000000d2/r.jpg', 'design', pg_temp.base())))$$,
  'P0001', 'duplicate_file', 'a design photo cannot also be a print');
select throws_ok($$select pg_temp.try_items(jsonb_build_array(jsonb_build_object(
    'path', 'pending/a0000000-0000-4000-8000-0000000000d2/r.jpg', 'size_cm', '10x15', 'quantity', 1, 'design', pg_temp.base())))$$,
  'P0001', 'invalid_items', 'print lines cannot carry a design');

select throws_ok($$select public.clean_gift_design('{}', 'pending/x/', 1)$$, '42501', null, 'anon: cannot call clean_gift_design');

-- ── Stored rows (as postgres) ─────────────────────────────────────────────────
reset role;

select is(
  (select i.design from public.order_items i join public.orders o on o.id = i.order_id
   where o.upload_id = 'a0000000-0000-4000-8000-0000000000d1'),
  '{"v": 1, "template": "white-mug", "rev": 1, "layout": "quad",
    "photos": [
      {"slot": 0, "path": "pending/a0000000-0000-4000-8000-0000000000d1/o-0.jpg", "file_name": "a.jpg", "w": 4000, "h": 3000, "crop": {"x": 0, "y": 0, "s": 1}},
      {"slot": 1, "path": "pending/a0000000-0000-4000-8000-0000000000d1/o-1.jpg", "file_name": "b.jpg", "w": 800, "h": 600, "crop": {"x": 0.25, "y": -0.5, "s": 1.5}},
      {"slot": 2, "path": "pending/a0000000-0000-4000-8000-0000000000d1/o-2.jpg", "file_name": "c.jpg", "w": 30, "h": 40, "crop": {"x": -1, "y": 1, "s": 2.1235}},
      {"slot": 3, "path": "pending/a0000000-0000-4000-8000-0000000000d1/o-3.jpg", "file_name": null, "w": 1, "h": 1, "crop": {"x": 1, "y": -1, "s": 5}}
    ],
    "text": {"font": "amiri", "color": "#7d582b"}}'::jsonb,
  'the stored design keeps only known keys, sorted by slot, color lower-case'
);
select results_eq(
  $$select i.file_path, i.file_name, i.personal_text, i.quantity, i.unit_price
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.upload_id = 'a0000000-0000-4000-8000-0000000000d1'$$,
  $$values ('pending/a0000000-0000-4000-8000-0000000000d1/g-render.jpg'::text, 'design.jpg'::text, 'Mama'::text, 2, 100.00::numeric)$$,
  'the line keeps the rendered print file and the words'
);
select is(
  (select count(*)::int from public.order_items i join public.orders o on o.id = i.order_id
   where o.upload_id = 'a0000000-0000-4000-8000-0000000000d3' and i.design is null),
  2, 'old lines are stored without a design'
);
select throws_ok(
  $$insert into public.order_items (order_id, kind, size_cm, product_id, quantity, unit_price, line_total, file_path, design)
    select o.id, 'print', '10x15', p.id, 1, 1, 1, 'x', '{}' from public.orders o, public.products p
    where o.upload_id = 'a0000000-0000-4000-8000-0000000000d1' and p.sku = 'PRINT-10X15'$$,
  '23514', null, 'a print line cannot have a design'
);
select throws_ok(
  $$insert into public.order_items (order_id, kind, gift_slug, product_id, quantity, unit_price, line_total, personal_text, design)
    select o.id, 'gift', 'white-mug', p.id, 1, 1, 1, 'x', '{}' from public.orders o, public.products p
    where o.upload_id = 'a0000000-0000-4000-8000-0000000000d1' and p.sku = 'GIFT-WHITE-MUG'$$,
  '23514', null, 'a design needs the line''s print file'
);

-- ── Self-registered user with no staff profile ────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated", "sub": "b0000000-0000-4000-8000-00000000000b"}';

select throws_ok($$select public.clean_gift_design('{}', 'pending/x/', 1)$$, '42501', null, 'authenticated: cannot call clean_gift_design');

-- ── service_role (the cleanup cron) ───────────────────────────────────────────
reset role;
set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

-- '-1 hour' so files inserted in this transaction already count as old enough.
select ok(
  'pending/a0000000-0000-4000-8000-0000000000d1/o-2.jpg' not in (select public.orphan_upload_paths(interval '-1 hour', 1000)),
  'cleanup: design photos are kept'
);
select ok(
  'pending/a0000000-0000-4000-8000-0000000000d1/g-render.jpg' not in (select public.orphan_upload_paths(interval '-1 hour', 1000)),
  'cleanup: the rendered print file is kept'
);
select ok(
  'pending/a0000000-0000-4000-8000-0000000000d1/unused.jpg' in (select public.orphan_upload_paths(interval '-1 hour', 1000)),
  'cleanup: unused uploads are still listed'
);

select * from finish();
rollback;
