# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build (runs tsc + Next.js build)
npm run lint         # ESLint (next/core-web-vitals + next/typescript)
npm run test         # Run Vitest once
npm run test:watch   # Vitest in watch mode
npm run seed:users   # Seed 3 default users into Supabase auth + profiles
```

Supabase CLI (for schema changes):
```bash
supabase link --project-ref <PROJECT_REF>
supabase db push     # Apply migrations
```

## Architecture

### Stack
- **Next.js 15** (App Router, TypeScript strict mode, typed routes enabled)
- **React 19** with server/client component separation
- **Supabase** (Auth + PostgreSQL) via `@supabase/ssr` for server-side auth
- **Vitest** for unit tests (Node environment, `*.test.ts` files)
- No Tailwind — custom CSS only (`src/app/globals.css`, ~13KB with CSS custom properties)

### Path Alias
`@/*` maps to `src/*` (configured in `tsconfig.json`).

### Auth & Authorization

Three Supabase clients for different contexts:
- `src/lib/supabaseClient.ts` — browser client
- `src/lib/supabaseServer.ts` — server components/routes
- `src/lib/supabaseAdmin.ts` — service role (admin operations, RPC calls)

Auth flow:
1. `src/middleware.ts` — redirects unauthenticated requests to `/login`
2. Server pages call `requireAuth()` (`src/lib/auth.ts`) to get the active `Profile`
3. API routes call `requireApiUser()` (`src/lib/apiAuth.ts`)
4. Role checks use helpers in `src/lib/authz.ts` (`canManageProducts`, `canVoidInvoices`, etc.)

Roles: `manager` | `sales`. Managers can manage products, void invoices, edit payments. Sales can create invoices.

Database permissions (`20261122130000_harden_legacy_permissions.sql`): `anon` has no table access; `authenticated` has SELECT only, and RLS returns rows only to active staff (`current_user_role() is not null`; a user can also read their own profile row). Every write, every staff RPC (they take the acting profile id as an argument) and every report RPC is `service_role` only, so call them through `createSupabaseAdminClient()` after `requireAuth()`/`requireApiUser()` and the role check. New functions must grant `service_role` (plus `authenticated` only when the function checks the caller itself).

### Business Logic Lives in the Database

Complex operations are PL/pgSQL functions in `supabase/migrations/20260220221500_init_mvp.sql`:
- `create_invoice(...)` — validates items, creates invoice + line items, deducts stock, logs `stock_movements`
- `void_invoice(...)` — manager-only, restores stock and logs `void_reversal` movements
- `update_invoice_payment(...)` — manager-only, recalculates `payment_status`
- `dashboard_metrics()` — returns KPIs (invoked by `/api/reports/dashboard`)
- `low_stock_items()` — returns products below threshold (invoked by `/api/alerts/low-stock`)

API routes call these via the admin Supabase client `.rpc()`. Never write invoices/stock directly from API routes — always go through the RPC functions.

### Route Structure

```
src/app/
  (auth)/login/          # Public login page
  (dashboard)/dashboard/ # Protected shell with sidebar nav
    page.tsx             # KPIs + low-stock preview
    products/            # CRUD (managers only for create/edit)
    invoices/            # List, create, detail
    low-stock/           # Full low-stock list
  api/
    invoices/            # POST create, PATCH payment, POST void
    products/            # POST create, GET list, PATCH update
    alerts/low-stock/    # GET low stock
    reports/dashboard/   # GET metrics
```

### Online orders (from the public website, mystudio-web)
- Migration `supabase/migrations/20261117200000_online_orders.sql`: tables `orders`, `order_items`, `order_events`, `online_print_sizes`; private Storage bucket `order-uploads`; 8 print products (`PRINT-10X15` … `PRINT-50X70`, `is_digital = true`, so no stock changes).
- The website uses only the anon key and can call just four functions: `online_print_prices()`, `online_gift_prices()`, `submit_order(...)`, `order_status_public(code)`. Anon may upload only to `order-uploads/pending/<uuid>/…`. The same migration revokes EXECUTE on every other function from `anon`/`PUBLIC`; new functions must grant EXECUTE explicitly (see "Database permissions" above).
- Staff: `/dashboard/orders` (list, all roles) and `/dashboard/orders/[id]` (photos via signed URLs, zip download, status moves via `update_order_status`, "Confirm → invoice" via `confirm_order_to_invoice`, which calls `create_invoice` with the order code as reference number).
- `20261122120000_online_orders_review_fixes.sql`: `submit_order` returns the existing code when an upload id is reused (a retry after a lost response), quantities must be whole numbers, phones accept Arabic-Indic digits, at most 100 files per upload folder, and `orphan_upload_paths()` (service role) lists uploads no order uses.
- `20261122140000_online_gifts.sql` (gift orders, Phase 2 slice 2): 14 gift products `GIFT-<SLUG>` (category Gifts, `is_digital = true`, so made-to-order gifts don't raise low-stock alerts) linked from `online_gift_products` (slug = the website's catalog slug, `personalization` photo / text / photo_or_text, `max_text_length`, `active`; staff read only, changes by migration for now). To track stock of the blanks, point `product_id` at the real stock product. `order_items.kind` is `print` or `gift`; gift lines have `gift_slug`, optional `file_path` and `personal_text`, no `size_cm`; `line_no` keeps the customer's order. `submit_order` takes `{"kind":"gift", slug, quantity, path?, file_name?, text?}` lines next to print lines (new codes `unknown_gift`, `photo_required`, `text_required`, `personalization_required`, `invalid_text`; at most 20 gift lines and 100 files per order). New anon RPC `online_gift_prices()`. `order_status_public` adds `gifts`. The order screen lists gift lines with their text, and the zip adds `GIFT_TEXT.txt`.
- `20261128100000_gift_designs.sql` (gift designer, Phase A): the website renders a print-ready JPG in the browser and uploads it plus each original photo. A gift line may carry `design` = `{v:1, template, rev, layout, photos:[{slot 0-3, path, file_name, w, h, crop:{x -1..1, y -1..1, s 1..5}}], text:{font cairo|amiri|ruqaa, color #rrggbb}|null}`; its `path` is then the rendered print file (`file_path`) and the words stay in `text` (`personal_text`). Stored in `order_items.design` (gift lines with a file only) after the internal `clean_gift_design` (codes `invalid_design`, `too_many_photos`, plus `invalid_path`/`missing_file` for photos) rebuilds it from known keys. `online_gift_products.max_photos` (1-4) is returned by `online_gift_prices()`. All files of an order (line paths + design photos) must be distinct, at most 200; upload folders take up to 300 files; `orphan_upload_paths()` keeps design photos. The order screen shows the print file, "Original 1..4" links and a design summary; the zip names them `NN_gift-<slug>_xQ_design.jpg` / `NN_gift-<slug>_original-K_<name>`.
- SQL tests: `supabase/tests/*.sql` (pgTAP, one transaction that rolls back, safe on the shared local DB): `docker exec -i supabase_db_myst psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/online_gifts_test.sql`.
- `/api/cron/cleanup-uploads` (daily via `vercel.json`, needs `CRON_SECRET`) deletes those orphan uploads after 24 hours through the Storage API. Direct SQL deletes on `storage.objects` are blocked by Supabase.
- WhatsApp status messages (`docs/WHATSAPP.md`): after `update_order_status` succeeds, the status route calls `notifyOrderStatus` (`src/lib/whatsapp/`). It stores the Arabic template message in `whatsapp_outbox` (migration `20261123100000_whatsapp_outbox.sql`, one row per order and event, staff read-only, service-role writes), then sends it through the provider chosen by `WHATSAPP_PROVIDER`. Only the log-only provider exists today, so rows end as `logged`, and the order page's "Customer messages" card offers a wa.me "Send on WhatsApp" button for sending by hand. Messaging never blocks a status change.
- Local dev: `npx supabase start` (Docker) applies migrations and `seed.sql` (includes sample order `MS-SAMPLE23`); `.env.local` points at the local stack; `node --env-file=.env.local scripts/seed-users.mjs` creates the test staff logins.

### Key Business Rules
- Stock can go negative (no hard floor)
- Default low-stock threshold: 3 units (configurable per-product or via global `settings` table)
- Invoice numbers: `INV-YYYYMMDD-000001` (generated by `next_invoice_number()`)
- Payment status: `paid` | `partially_paid` | `unpaid` (auto-derived from `paid_amount` vs `total`)

### UX principles (apply to every screen and new feature)
Staff use this all day, often on a phone at the counter. Check new work against:
- **Fitts's law:** primary actions are big (44px+) and easy to reach; destructive ones are smaller and apart from them.
- **Hick's law:** few choices per screen; sensible defaults (e.g. today's date, "paid in full").
- **Jakob's law:** keep the patterns this app already uses (list → detail, chips for status, modal to confirm). Don't invent new ones per screen.
- **Postel's law:** accept messy input (Arabic digits, phone formats, spaces) and store it clean.
- **Doherty threshold:** anything slower than ~400ms shows progress or a disabled "Saving..." state.
- **Goal-gradient / peak-end:** multi-step flows show where the user is and end with a clear result (toast + link to what was created).
- **Von Restorff:** one `btn primary` per area; secondary actions are `btn` or `btn ghost`, danger actions `btn danger`.
- **Tesler's law:** business rules live in the database functions, not in what staff have to remember.
- Frameworks: Nielsen's 10 heuristics for reviews; WCAG 2.2 AA (contrast, labels, focus, errors next to the field). The customer-facing site's full version is in `../mystudio-web/CLAUDE.md`.

### Styling
All styles in `src/app/globals.css`. Key CSS variables:
- `--bg-base`, `--bg-surface`, `--bg-surface-2` — background layers
- `--accent-500` — primary blue (`#1a63d1`)
- `--success-500`, `--warning-500`, `--danger-500` — status colors
- `--text-strong`, `--text-body`, `--text-muted` — text hierarchy

Fonts: Manrope (display/headings) + Source Sans 3 (body), loaded via `next/font/google` in `src/app/layout.tsx`.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # Server-only, never expose to client
APP_CURRENCY=EGP
APP_TIMEZONE=Africa/Cairo
MYST_SEED_PASSWORD=              # Only needed for seed:users script
```
