-- pgTAP tests for one photo in several print sizes (20261128110000_print_sizes_per_photo.sql).
-- Runs in one transaction and rolls back, so it is safe on the shared local database:
--   docker exec -i supabase_db_myst psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/print_sizes_per_photo_test.sql
-- (or `npx supabase test db`).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

-- ── Fixtures (as postgres) ────────────────────────────────────────────────────
-- E1 = one photo in two sizes plus a designed gift, E2 = error cases (every call there must fail).
insert into storage.objects (bucket_id, name) values
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000e1/beach.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000e1/g-render.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000e1/o-0.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000e2/a.jpg'),
  ('order-uploads', 'pending/a0000000-0000-4000-8000-0000000000e2/r.jpg');

create function pg_temp.try_items(p_items jsonb) returns jsonb language sql as $$
  select public.submit_order('a0000000-0000-4000-8000-0000000000e2', 'Sara', '01001234567', 'pickup', null, null, null, p_items)
$$;
grant execute on function pg_temp.try_items(jsonb) to anon;

-- ── anon (the public website) ─────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

-- beach.jpg: 2 × 10x15 (25) + 1 × 20x30 (75), plus a white mug design (100) = 225.
select is(
  (public.submit_order('a0000000-0000-4000-8000-0000000000e1', 'Mona', '01001234567', 'pickup', null, null, null,
    $$[{"path": "pending/a0000000-0000-4000-8000-0000000000e1/beach.jpg", "file_name": "beach.jpg", "size_cm": "10x15", "quantity": 2},
       {"path": "pending/a0000000-0000-4000-8000-0000000000e1/beach.jpg", "file_name": "beach.jpg", "size_cm": "20x30", "quantity": 1},
       {"kind": "gift", "slug": "white-mug", "quantity": 1, "path": "pending/a0000000-0000-4000-8000-0000000000e1/g-render.jpg",
        "design": {"v": 1, "template": "white-mug", "rev": 1, "layout": "single", "text": null,
          "photos": [{"slot": 0, "path": "pending/a0000000-0000-4000-8000-0000000000e1/o-0.jpg", "w": 10, "h": 10, "crop": {"x": 0, "y": 0, "s": 1}}]}}]$$::jsonb
  ) ->> 'total')::numeric,
  225::numeric,
  'anon: one photo in two sizes is accepted and priced per size'
);

select throws_ok($$select pg_temp.try_items('[
    {"path": "pending/a0000000-0000-4000-8000-0000000000e2/a.jpg", "size_cm": "10x15", "quantity": 1},
    {"path": "pending/a0000000-0000-4000-8000-0000000000e2/a.jpg", "size_cm": "10x15", "quantity": 2}
  ]')$$,
  'P0001', 'duplicate_file', 'the same photo and size twice');
select throws_ok($$select pg_temp.try_items('[
    {"path": "pending/a0000000-0000-4000-8000-0000000000e2/a.jpg", "size_cm": "10x15", "quantity": 1},
    {"path": "pending/a0000000-0000-4000-8000-0000000000e2/a.jpg", "size_cm": "20x30", "quantity": 1},
    {"kind": "gift", "slug": "magic-mug", "quantity": 1, "path": "pending/a0000000-0000-4000-8000-0000000000e2/a.jpg"}
  ]')$$,
  'P0001', 'duplicate_file', 'a print photo reused by a gift line');
select throws_ok($$select pg_temp.try_items('[
    {"path": "pending/a0000000-0000-4000-8000-0000000000e2/a.jpg", "size_cm": "10x15", "quantity": 1},
    {"kind": "gift", "slug": "white-mug", "quantity": 1, "path": "pending/a0000000-0000-4000-8000-0000000000e2/r.jpg",
     "design": {"v": 1, "template": "white-mug", "rev": 1, "layout": "single",
       "photos": [{"slot": 0, "path": "pending/a0000000-0000-4000-8000-0000000000e2/a.jpg", "w": 10, "h": 10, "crop": {"x": 0, "y": 0, "s": 1}}]}}
  ]')$$,
  'P0001', 'duplicate_file', 'a print photo reused as a design photo');
select throws_ok(
  format('select pg_temp.try_items(%L)',
    (select jsonb_agg(jsonb_build_object('path', 'pending/a0000000-0000-4000-8000-0000000000e2/a.jpg', 'size_cm', '10x15', 'quantity', 1))
     from generate_series(1, 301))),
  'P0001', 'invalid_items', 'more than 300 print lines');
-- 300 lines pass the line cap and reach the next check (all the same photo and size, so duplicate_file).
select throws_ok(
  format('select pg_temp.try_items(%L)',
    (select jsonb_agg(jsonb_build_object('path', 'pending/a0000000-0000-4000-8000-0000000000e2/a.jpg', 'size_cm', '10x15', 'quantity', 1))
     from generate_series(1, 300))),
  'P0001', 'duplicate_file', '300 print lines are within the line cap');

-- ── Stored rows (as postgres) ─────────────────────────────────────────────────
reset role;

select results_eq(
  $$select i.kind, i.size_cm, i.quantity, i.file_path from public.order_items i join public.orders o on o.id = i.order_id
    where o.upload_id = 'a0000000-0000-4000-8000-0000000000e1' order by i.line_no$$,
  $$values ('print'::text, '10x15'::text, 2, 'pending/a0000000-0000-4000-8000-0000000000e1/beach.jpg'::text),
           ('print', '20x30', 1, 'pending/a0000000-0000-4000-8000-0000000000e1/beach.jpg'),
           ('gift', null, 1, 'pending/a0000000-0000-4000-8000-0000000000e1/g-render.jpg')$$,
  'each size of the photo is its own line'
);
select is(
  (select details from public.order_events e join public.orders o on o.id = e.order_id
   where o.upload_id = 'a0000000-0000-4000-8000-0000000000e1' and e.action = 'created'),
  '{"items": 3, "prints": 2, "gifts": 1, "total": 225.00}'::jsonb,
  'the created event counts print lines'
);

select * from finish();
rollback;
